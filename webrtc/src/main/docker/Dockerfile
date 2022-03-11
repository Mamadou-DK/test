FROM python:3.10-slim

ARG certhost=localhost

RUN apt-get update -y && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
     gcc python3-dev \
     libzbar-dev libzbar0 \
    && rm -rf /var/lib/apt/lists/* 

RUN pip install pip --upgrade && \ 
    pip install aiohttp aiortc opencv-python-headless pyzbar


#generate https certificate
COPY ["./src/main/docker/myCA.*", "./src/main/docker/genCert.sh", "/certs/" ]
WORKDIR /certs
RUN chmod 600 /certs/myCA.* && \
    chmod u+x /certs/genCert.sh && \
    /certs/genCert.sh ${certhost} && \
    mv /certs/certs/${certhost}.crt /certs/certs/aiortc.crt && \
    mv /certs/certs/${certhost}.key /certs/certs/aiortc.key

WORKDIR /app
COPY "./src/main/python/" .

EXPOSE 8080

ENTRYPOINT [ "python", "server.py", "--cert-file=/certs/certs/aiortc.crt" , "--key-file=/certs/certs/aiortc.key"]