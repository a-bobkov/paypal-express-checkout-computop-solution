## Demonstration of Computop Paypal Express Checkout.

1. Install mkcert

[mkcert](https://github.com/FiloSottile/mkcert) is a simple tool for making locally-trusted development certificates.

Save root CA location for Node.js:
```shell
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
```
2. Generate locally-trusted development certificate:
```shell
mkdir certificates && cd certificates && mkcert localhost && cd ..
```
3. Create .env file and populate it with your constants:
```shell
cat <<EOF >.env
MERCHANT_ID=
KEY_BLOWFISH=
KEY_HMAC=
EOF
```
4. Run the test:
```shell
node index.js
```
