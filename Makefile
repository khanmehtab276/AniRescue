.PHONY: help setup doctor install test ci frontend-lint frontend-build frontend-e2e backend-test worker-test research-test ai-image ai-setup ai-test stack-up stack-down stack-status stack-logs docker-clean offline-build offline-publish smoke preflight deploy

OPS := bash ./tools/ops/anirescue.sh

help:
	@$(OPS) help

setup:
	@$(OPS) setup

doctor:
	@$(OPS) doctor

install:
	@$(OPS) install

test:
	@$(OPS) test

ci:
	@$(OPS) ci

frontend-lint:
	@$(OPS) frontend-lint

frontend-build:
	@$(OPS) frontend-build

frontend-e2e:
	@$(OPS) frontend-e2e

backend-test:
	@$(OPS) backend-test

worker-test:
	@$(OPS) worker-test

research-test:
	@$(OPS) research-test

ai-image:
	@$(OPS) ai-image

ai-setup:
	@$(OPS) ai-setup

ai-test:
	@$(OPS) ai-test

stack-up:
	@$(OPS) stack-up

stack-down:
	@$(OPS) stack-down

stack-status:
	@$(OPS) stack-status

stack-logs:
	@$(OPS) stack-logs

docker-clean:
	@$(OPS) docker-clean

offline-build:
	@$(OPS) offline-build

offline-publish:
	@$(OPS) offline-publish

smoke:
	@$(OPS) smoke

preflight:
	@$(OPS) preflight

deploy:
	@$(OPS) deploy
