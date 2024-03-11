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

await testComputopPaypalRegular({
    OrderDesc: 'Name:Laterne schwarz-Sku:3651462-00000-Quantity:1',
    Currency: 'EUR',
    Amount: '5594',
    TaxTotal: '893',
    ItemTotal: '4106',
    shAmount: '595',
    FirstName: 'Andrey',
    LastName: 'Bobkov',
    AddrStreet: 'St.-Martin-Straße 102',
    AddrStreet2: 'c/o Mediawave',
    AddrCity: 'München',
    AddrZip: '81669',
    AddrCountryCode: 'DE',
    RefNr: generateRefNr(),
    TransID: generateTransId(),
});

async function testComputopPaypalRegular(order)
{
    const {PayID} = await startComputopPaypalRegular(order);

    await completeComputopPaypalRegular(order, {
        PayID,
        // RefNr: generateRefNr(),
    });
}

async function startComputopPaypalRegular(order)
{
    const startComputopPaypalRegularUrl = prepareStartComputopPaypalRegularUrl(order);

    log(`Start computop paypal regular url: ${ startComputopPaypalRegularUrl }`);

    const startComputopPaypalRegularResponse = await requestStartComputopPaypalRegular(startComputopPaypalRegularUrl);

    log(`Start computop paypal regular response: ${ startComputopPaypalRegularResponse }`);

    const parsedStartComputopPaypalRegularResponse = parseStartComputopPaypalRegularResponse(startComputopPaypalRegularResponse);

    log(`Parsed start computop paypal regular response: ${ formatJson(parsedStartComputopPaypalRegularResponse) }`);

    return parsedStartComputopPaypalRegularResponse;
}

function prepareStartComputopPaypalRegularUrl(orderParameters)
{
    const requestParameters = {
        ReqID: generateReqId(),
        Capture: 'Auto',
        // TxType: 'Auth',
        URLSuccess: `https://${hostname}:${port}/computop-pay-pal-success`,
        URLFailure: `https://${hostname}:${port}/computop-pay-pal-failure`,
        URLNotify: `https://${hostname}:${port}/computop-pay-pal-notify`,
        Response: 'encrypt',
        ...orderParameters,
    };

    const macKey = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.MAC = computop.generateHash(macKey);

    log(`Preparing start computop shortcut payment url with parameters: ${ formatJson(requestParameters) }`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const urlParams = new URLSearchParams({
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
        URLBack: `https://${hostname}:${port}/computop-pay-pal-back`,
    });

    return `https://www.computop-paygate.com/paypal.aspx?${urlParams}`;
}

async function requestStartComputopPaypalRegular(url)
{
    const browser = await open(url);

    const serverOptions = {
        key: await fs.readFile('certificate/localhost-key.pem'),
        cert: await fs.readFile('certificate/localhost.pem'),
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

    return `https://${hostname}:${port}${request.url}`;
}

function parseStartComputopPaypalRegularResponse(url)
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

async function completeComputopPaypalRegular(order, mergeProperties)
{
    const completeComputopPaypalRegularRequest = prepareCompleteComputopPaypalRegularRequest(order, mergeProperties);

    log(`Complete computop paypal regular request: ${ JSON.stringify(completeComputopPaypalRegularRequest) }`);

    const completeComputopPaypalRegularResponse = await executeCompleteComputopPaypalRegularRequest(completeComputopPaypalRegularRequest);

    log(`Complete computop paypal regular response: ${ completeComputopPaypalRegularResponse }`);

    const parsedCompleteComputopPaypalRegularResponse = parseCompleteComputopPaypalRegularResponse(completeComputopPaypalRegularResponse);

    log(`Parsed complete computop paypal regular response: ${ formatJson(parsedCompleteComputopPaypalRegularResponse) }`);
}

function prepareCompleteComputopPaypalRegularRequest(order, mergeProperties)
{
    const requestParameters = {
        ReqID: generateReqId(),
        TransID: order.TransID,
        Amount: order.Amount,
        Currency: order.Currency,
        Response: 'encrypt',
        ...mergeProperties,
    };

    const keyMac = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.MAC = computop.generateHash(keyMac);

    log(`Preparing complete computop regular payment request with parameters: ${ formatJson(requestParameters) }`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const formParams = {
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
    };

    return {
        method: 'POST',
        protocol: 'https:',
        host: 'www.computop-paygate.com',
        port: 443,
        path: '/inquire.aspx',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `${new URLSearchParams(formParams)}`,
    };
}

async function executeCompleteComputopPaypalRegularRequest({ body, ...options })
{
    const request = https.request(options);

    request.end(body);

    const [response] = await events.once(request, 'response');

    const responseChunks = [];

    for await (const chunk of response)
    {
        responseChunks.push(chunk);
    }

    return Buffer.concat(responseChunks).toString();
}

function parseCompleteComputopPaypalRegularResponse(search)
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

function generateTransId()
{
    const salt = 'TransId' + Date.now().toString();

    return crypto.createHash('md5').update(salt).digest('hex');
}

function generateReqId()
{
    const salt = 'ReqId' + Date.now().toString();

    return crypto.createHash('md5').update(salt).digest('hex');
}

function generateRefNr()
{
    return 'DE--' + Date.now().toString().slice(2,-2);
}

function log(text)
{
    console.log('\n' + text);
}

function formatJson(obj)
{
    return JSON.stringify(obj, null, 4);
}
