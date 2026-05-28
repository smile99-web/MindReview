#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h db -U mindreview -d mindreview -q; do
  echo "  PostgreSQL not ready — sleeping 2s..."
  sleep 2
done
echo "PostgreSQL is ready."

echo "Running database migrations..."
cd /app
node ./node_modules/prisma/build/index.js migrate deploy
echo "Migrations complete."

echo "Starting Next.js server..."
exec node server.js
