@echo off
set NODE_ENV=development
set NODE_OPTIONS='--inspect-brk'
node "%~dp0\dev" %*
