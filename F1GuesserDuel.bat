@echo off
if not exist node_modules (
    echo Se instaleaza dependentele, te rugam asteapta...
    call npm install
)
echo Se porneste serverul...
node server.js
pause