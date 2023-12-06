import * as https from 'node:https';
import * as events from 'node:events';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as computop from 'computop-node-client';
import open from 'open';

if (!process.env.MERCHANT_ID) {
    console.log('Please create .env file and add value MERCHANT_ID');
    process.exit(1);
}
const merchantId = process.env.MERCHANT_ID;

const hostname = 'localhost';
const port = 3000;

await testComputopPaypalShortcut({
    Currency: 'EUR',
    Amount: '2199',
    TaxTotal: '351',
    ItemTotal: '1848',
    shAmount: '0',
    OrderDesc: 'Name:Teesieb-Sku:2894323-00000-Quantity:1',
});

async function testComputopPaypalShortcut(order)
{
    const startComputopPaypalShortcutResponse = await startComputopPaypalShortcut(order);

    await completeComputopPaypalShortcut(order, startComputopPaypalShortcutResponse, {
        FirstName: 'FirstName',
        LastName: 'LastName',
        AddrStreet: 'Neue Teststraße 22',
        AddrStreet2: 'c/o Mustermann',
        AddrCity: 'Mannheim',
        AddrZip: '68169',
        AddrCountryCode: 'DE',
    });
}

async function startComputopPaypalShortcut(order)
{
    const startComputopPaypalShortcutUrl = prepareStartComputopPaypalShortcutUrl(order);

    log(`Start computop paypal shortcut url: ${startComputopPaypalShortcutUrl}`);

    const startComputopPaypalShortcutResponse = await requestStartComputopPaypalShortcut(startComputopPaypalShortcutUrl);

    log(`Start computop paypal shortcut response: ${startComputopPaypalShortcutResponse}`);

    const parsedStartComputopPaypalShortcutResponse = parseStartComputopPaypalShortcutResponse(startComputopPaypalShortcutResponse);

    log(`Parsed start computop paypal shortcut response: ${formatJson(parsedStartComputopPaypalShortcutResponse)}`);

    return parsedStartComputopPaypalShortcutResponse;
}

async function completeComputopPaypalShortcut(order, startComputopPaypalShortcutResponse, changedDestination)
{
    const completeComputopPaypalShortcutUrl = prepareCompleteComputopPaypalShortcutUrl(Object.assign(
        {
            PayID: startComputopPaypalShortcutResponse.PayID,
            TransID: startComputopPaypalShortcutResponse.TransID,
            Amount: order.Amount,
            Currency: order.Currency,
        },
        changedDestination
    ));

    log(`Complete computop paypal shortcut url: ${completeComputopPaypalShortcutUrl}`);

    const completeComputopPaypalShortcutResponse = await requestCompleteComputopPaypalShortcut(completeComputopPaypalShortcutUrl);

    log(`Complete computop paypal shortcut response: ${completeComputopPaypalShortcutResponse}`);

    const parsedCompleteComputopPaypalShortcutResponse = parseCompleteComputopPaypalShortcutResponse(completeComputopPaypalShortcutResponse);

    log(`Parsed complete computop paypal shortcut response: ${formatJson(parsedCompleteComputopPaypalShortcutResponse)}`);
}

function prepareStartComputopPaypalShortcutUrl(orderParameters)
{
    const requestParameters = Object.assign({
        TransID: generateTransId(),
        PayPalMethod: 'shortcut',
        Capture: 'Auto',
        URLSuccess: `https://${hostname}:${port}/computop-pay-pal-success`,
        URLFailure: `https://${hostname}:${port}/computop-pay-pal-failure`,
        URLNotify: `https://${hostname}:${port}/computop-pay-pal-notify`,
        Response: 'encrypt',
    }, orderParameters);

    const macKey = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.mac = computop.generateHash(macKey);

    log(`Preparing start computop shortcut payment url with parameters: ${formatJson(requestParameters)}`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const urlParams = new URLSearchParams({
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
        URLBack: `https://${hostname}:${port}/computop-pay-pal-back`,
    });

    return `https://www.computop-paygate.com/paypal.aspx?${urlParams}`;

    function generateTransId()
    {
        const salt = Date.now().toString();

        return crypto.createHash('md5').update(salt).digest('hex');
    }
}

async function requestStartComputopPaypalShortcut(url)
{
    const browser = await open(url);

    const serverOptions = {
        key: await fs.readFile('certificates/localhost-key.pem'),
        cert: await fs.readFile('certificates/localhost.pem'),
    };

    const httpServer = https.createServer(serverOptions);

    httpServer.listen(port, hostname);

    await events.once(httpServer, 'listening');

    const [request, response] = await events.once(httpServer, 'request');

    response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end('The tab is not needed any more. Please close the tab manually!');

    httpServer.closeAllConnections();
    httpServer.close();

    browser.kill('SIGINT');

    return `https://${hostname}:${port}${request.url}`;
}

function parseStartComputopPaypalShortcutResponse(url)
{
    const reqURL = new URL(url);

    if (reqURL.pathname === '/computop-pay-pal-failure')
    {
        const decoded = decodeDataFromSearchParams(reqURL.searchParams);

        throw new Error('Received failure from Computop', {cause: decoded});
    }

    if (reqURL.pathname === '/computop-pay-pal-success')
    {
        return decodeDataFromSearchParams(reqURL.searchParams);
    }
}

function prepareCompleteComputopPaypalShortcutUrl(properties)
{
    const requestParameters = Object.assign({
        Response: 'encrypt',
    }, properties);

    const keyMac = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.mac = computop.generateHash(keyMac);

    log(`Preparing complete computop shortcut payment url with parameters: ${formatJson(requestParameters)}`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const urlParams = new URLSearchParams({
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
        URLBack: `https://${hostname}:${port}/computop-pay-pal-back`,
    });

    return `https://www.computop-paygate.com/paypalComplete.aspx?${urlParams}`;
}

async function requestCompleteComputopPaypalShortcut(url)
{
    const request = https.request(url);

    request.end();

    await events.once(request, 'response');

    const response = request.res;   // events.once above returns not workable response with prototype Object(0)

    const responseChunks = [];

    for await (const chunk of response)
    {
        responseChunks.push(chunk);
    }

    return Buffer.concat(responseChunks).toString();
}

function parseCompleteComputopPaypalShortcutResponse(search)
{
    const searchParams = new URLSearchParams(search);

    return decodeDataFromSearchParams(searchParams);
}

function decodeDataFromSearchParams(searchParams)
{
    const len = searchParams.get('Len');

    if (!len) {
        throw new Error('Url does not contain "Len"');
    }

    const data = searchParams.get('Data')

    if (!data) {
        throw new Error('Url does not contain "Data"');
    }

    const decoded = computop.decryptBlowfish(data).trim();

    if (decoded.length !== parseInt(len)) {
        throw new Error(`Url decoded data length (${decoded.length}) not equal Len (${len})`);
    }

    console.log(' decoded: ', decoded);

    return Object.fromEntries(decoded.split('&').map(param => param.split('=')));
}

function log(text)
{
    console.log('\n' + text);
}

function formatJson(obj)
{
    return JSON.stringify(obj, null, 4);
}
