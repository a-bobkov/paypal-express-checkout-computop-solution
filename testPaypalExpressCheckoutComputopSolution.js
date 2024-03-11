/**
 * Copyright 2024 Andrey Bobkov - https://github.com/a-bobkov
 * Use of this software requires acceptance of the License Agreement. See LICENSE file in this folder.
 */

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

await testPaypalExpressCheckoutComputopSolution({
    OrderDesc: 'Name:Tee-spoon-Sku:2894323-00011-Quantity:2',
    Currency: 'EUR',
    Amount: '2199',
    TaxTotal: '351',
    ItemTotal: '1848',
    shAmount: '0',
});

async function testPaypalExpressCheckoutComputopSolution(shoppingCart)
{
    const decodedStartCallbackUrl = await startPaypalExpressCheckoutComputop(shoppingCart);

    await completePaypalExpressCheckoutComputop(shoppingCart, decodedStartCallbackUrl, {
        FirstName: 'Andrey',
        LastName: 'Bobkov',
        AddrStreet: 'St.-Martin-Straße 102',
        AddrStreet2: 'c/o Mediawave',
        AddrCity: 'München',
        AddrZip: '81669',
        AddrCountryCode: 'DE',
        RefNr: generateRandomRefNr(),
    });
}

async function startPaypalExpressCheckoutComputop(shoppingCart)
{
    const startUrl = prepareStartUrl(shoppingCart);

    log(`Start url: ${ startUrl }`);

    const startCallBackUrl = await requestStart(startUrl);

    log(`Start callback url: ${ startCallBackUrl }`);

    const decodedStartCallbackUrl = decodeStartCallbackUrl(startCallBackUrl);

    log(`Decoded start callback url: ${ formatJson(decodedStartCallbackUrl) }`);

    return decodedStartCallbackUrl;
}

async function completePaypalExpressCheckoutComputop(order, decodedStartCallbackUrl, changedDeliveryAddress)
{
    const completeUrl = prepareCompleteUrl({
        PayID: decodedStartCallbackUrl.PayID,
        TransID: decodedStartCallbackUrl.TransID,
        Amount: order.Amount,
        Currency: order.Currency,
        ...changedDeliveryAddress,
    });

    log(`Complete url: ${ completeUrl }`);

    const completeResponse = await requestComplete(completeUrl);

    log(`Complete response: ${ completeResponse }`);

    const decodedCompleteResponse = decodeCompleteResponse(completeResponse);

    log(`Decoded complete response: ${ formatJson(decodedCompleteResponse) }`);
}

function prepareStartUrl(shoppingCart)
{
    const requestParameters = {
        TransID: generateRandomTransId(),
        PayPalMethod: 'shortcut',
        Capture: 'Auto',
        URLSuccess: `https://${ hostname }:${ port }/computop-pay-pal-success`,
        URLFailure: `https://${ hostname }:${ port }/computop-pay-pal-failure`,
        URLNotify: `https://${ hostname }:${ port }/computop-pay-pal-notify`,
        Response: 'encrypt',
        ...shoppingCart,
    };

    const macKey = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.Mac = computop.generateHash(macKey);

    log(`Preparing start url with parameters: ${ formatJson(requestParameters) }`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const urlParams = new URLSearchParams({
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
        URLBack: `https://${ hostname }:${ port }/computop-pay-pal-back`,
    });

    return `https://www.computop-paygate.com/paypal.aspx?${ urlParams }`;
}

async function requestStart(url)
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

    return `https://${ hostname }:${ port }${ request.url }`;
}

function decodeStartCallbackUrl(url)
{
    const reqURL = new URL(url);

    if (reqURL.pathname === '/computop-pay-pal-failure')
    {
        const decoded = decodeDataFromSearchParams(reqURL.searchParams);

        throw new Error('Received failure from Computop', { cause: decoded });
    }

    if (reqURL.pathname === '/computop-pay-pal-success')
    {
        return decodeDataFromSearchParams(reqURL.searchParams);
    }
}

function prepareCompleteUrl(properties)
{
    const requestParameters = {
        Response: 'encrypt',
        ...properties,
    };

    const keyMac = [
        requestParameters.PayID,
        requestParameters.TransID,
        merchantId,
        requestParameters.Amount,
        requestParameters.Currency,
    ].join('*');

    requestParameters.Mac = computop.generateHash(keyMac);

    log(`Preparing complete url with parameters: ${ formatJson(requestParameters) }`);

    const request = computop.buildRequest(requestParameters);

    const encoded = computop.encryptBlowfish(request);

    const urlParams = new URLSearchParams({
        MerchantID: merchantId,
        Data: encoded,
        Len: request.length,
        URLBack: `https://${ hostname }:${ port }/computop-pay-pal-back`,
    });

    return `https://www.computop-paygate.com/paypalComplete.aspx?${ urlParams }`;
}

async function requestComplete(url)
{
    const request = https.request(url);

    request.end();

    const [response] = await events.once(request, 'response');

    const responseChunks = [];

    for await (const chunk of response)
    {
        responseChunks.push(chunk);
    }

    return Buffer.concat(responseChunks).toString();
}

function decodeCompleteResponse(search)
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
        throw new Error(`Url decoded data length (${ decoded.length }) not equal Len (${ len })`);
    }

    console.log(' decoded: ', decoded);

    return Object.fromEntries(decoded.split('&').map(param => param.split('=')));
}

function generateRandomRefNr()
{
    return 'DE--' + Date.now().toString().slice(2,-2);
}

function generateRandomTransId()
{
    const salt = Date.now().toString();

    return crypto.createHash('md5').update(salt).digest('hex');
}

function log(text)
{
    console.log('\n' + text);
}

function formatJson(obj)
{
    return JSON.stringify(obj, null, 4);
}
