.PHONY: help test ci frontend-lint frontend-build frontend-e2e backend-test worker-test research-test offline-build offline-publish smoke preflight deploy

OPS := ./tools/ops/anirescue.sh

help:
	@$(OPS) help
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
