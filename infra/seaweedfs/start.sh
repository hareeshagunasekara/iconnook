#!/bin/sh
# Starts SeaweedFS (master + volume + filer + S3 gateway in one process) for local development,
# with S3 credentials taken from the environment and the app bucket created on first start.
set -eu

mkdir -p /data /etc/seaweedfs
rm -f /tmp/bucket-ready

cat > /etc/seaweedfs/s3.json <<EOF
{
  "identities": [
    {
      "name": "iconnook-dev",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
EOF

weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json -volume.max=0 &
WEED_PID=$!

# Wait for the S3 gateway, then create the bucket (idempotent).
until wget -q --spider http://127.0.0.1:8333/healthz 2>/dev/null; do sleep 1; done
echo "s3.bucket.create -name ${S3_BUCKET}" | weed shell >/dev/null 2>&1 || true
touch /tmp/bucket-ready

wait "$WEED_PID"
