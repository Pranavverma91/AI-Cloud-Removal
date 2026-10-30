#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null; then
  echo 'Install Node.js 22.13 or newer from https://nodejs.org and reopen this file.'
  read -r -p 'Press Return to close.'
  exit 1
fi
node scripts/start-personal.mjs
read -r -p 'Press Return to close.'
