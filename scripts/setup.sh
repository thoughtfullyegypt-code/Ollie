#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# This bootstrap prepares an isolated development preview only.
node --input-type=module <<'JS'
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.env.local')) {
 const template=readFileSync('.env.example','utf8');
 writeFileSync('.env.local',template.replace(/^BETTER_AUTH_SECRET=$/m,`BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`),{mode:0o600});
}
process.loadEnvFile('.env.local');
if(process.env.APP_MODE!=='development')throw new Error('This bootstrap is for development only. Use the production deployment instructions for another application mode.');
if(!process.env.BETTER_AUTH_SECRET){
 let local=readFileSync('.env.local','utf8');const secret=randomBytes(48).toString('base64url');
 local=/^BETTER_AUTH_SECRET=.*$/m.test(local)?local.replace(/^BETTER_AUTH_SECRET=.*$/m,`BETTER_AUTH_SECRET=${secret}`):`${local}\nBETTER_AUTH_SECRET=${secret}\n`;
 writeFileSync('.env.local',local,{mode:0o600});
}else if(process.env.BETTER_AUTH_SECRET.length<32)throw new Error('Existing authentication secret is too short. Replace it securely; it was not overwritten.');
JS
npm ci --no-audit --no-fund
TASK_DATA_DIR="$(node --env-file=.env.local --input-type=module -e "import{resolve}from'node:path';process.stdout.write(process.env.DEV_DATA_DIR||resolve('..','.seat-at-internet-data'))")"
mkdir -p "$TASK_DATA_DIR"
chmod 700 "$TASK_DATA_DIR"
nohup npm run db:start >> "$TASK_DATA_DIR/postgres.log" 2>&1 < /dev/null &
ready=false
for attempt in $(seq 1 40); do
 if node --env-file=.env.local --input-type=module <<'JS'
import {Client} from 'pg';
const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1000});
try {await c.connect();await c.query('SELECT 1');await c.end();}catch{await c.end().catch(()=>{});process.exit(1);}
JS
 then ready=true; break; fi
 sleep 0.25
done
if [ "$ready" != true ]; then echo 'Development PostgreSQL did not become ready. Inspect the private database log.' >&2; exit 1; fi
npm run db:migrate
npm run db:seed
npm run build
