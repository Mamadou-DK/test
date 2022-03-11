#!/bin/sh

## generate a signed https cert. using the root CA from ./myCA.pem

if [ "$#" -ne 1 ]
then
  echo "Usage: Must supply a domain"
  exit 1
fi

DOMAIN=$1

mkdir -p ./certs
cd ./certs

# openssl genrsa -out $DOMAIN.key 2048
# openssl req -new -key $DOMAIN.key -out $DOMAIN.csr
openssl req -nodes -newkey rsa:2048 -keyout $DOMAIN.key -out $DOMAIN.csr -subj "/C=FR/ST=Belfort/L=Belfort/O=Test Security/OU=Dev Department/CN=$DOMAIN"


cat > $DOMAIN.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = $DOMAIN
EOF

openssl x509 -req -in $DOMAIN.csr -CA ../myCA.pem -CAkey ../myCA.key -CAcreateserial \
-passin pass:myCA -out $DOMAIN.crt -days 825 -sha256 -extfile $DOMAIN.ext
