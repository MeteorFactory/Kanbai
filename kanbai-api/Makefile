DEV_CODE ?= KANBAI
DEV_WORKSPACE ?= default

.PHONY: dev install

install:
	npm install

dev: install
	KANBAI_DEV_CODE=$(DEV_CODE) KANBAI_DEV_WORKSPACE=$(DEV_WORKSPACE) npm run dev
