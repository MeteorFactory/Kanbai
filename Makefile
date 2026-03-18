# Force bash on all platforms (on Windows, use Git Bash)
ifeq ($(OS),Windows_NT)
  SHELL := $(firstword $(wildcard C:/Program\ Files/Git/bin/bash.exe) bash)
endif
SHELL ?= /bin/bash
.SHELLFLAGS := -c

.PHONY: dev check

STAMP = node_modules/.install-stamp

$(STAMP): package.json
	npm install
	@node -e "require('fs').writeFileSync('node_modules/.install-stamp','')"

dev: $(STAMP)
	npm run dev

check: $(STAMP)
	@echo ""
	@echo "══════════════════════════════════════"
	@echo "  Kanbai — Pre-deploy Check"
	@echo "══════════════════════════════════════"
	@echo ""
	@LINT=0; TYPES=0; TESTS=0; BUILD=0; \
	echo "▸ [1/4] Lint..."; \
	if npm run lint --silent 2>&1 | tail -1 | grep -q "error"; then \
		LINT=1; echo "  ✗ Lint FAILED"; \
	else \
		echo "  ✓ Lint OK"; \
	fi; \
	echo "▸ [2/4] Typecheck..."; \
	if npm run typecheck --silent > /dev/null 2>&1; then \
		echo "  ✓ Typecheck OK"; \
	else \
		TYPES=1; echo "  ✗ Typecheck FAILED"; \
	fi; \
	echo "▸ [3/4] Tests..."; \
	if npm run test --silent > /dev/null 2>&1; then \
		echo "  ✓ Tests OK"; \
	else \
		TESTS=1; echo "  ✗ Tests FAILED"; \
	fi; \
	echo "▸ [4/4] Build..."; \
	if npm run build --silent > /dev/null 2>&1; then \
		echo "  ✓ Build OK"; \
	else \
		BUILD=1; echo "  ✗ Build FAILED"; \
	fi; \
	echo ""; \
	echo "──────────────────────────────────────"; \
	TOTAL=$$((LINT + TYPES + TESTS + BUILD)); \
	PASSED=$$((4 - TOTAL)); \
	if [ $$TOTAL -eq 0 ]; then \
		echo "  ✓ ALL PASSED (4/4) — Ready to deploy"; \
	else \
		echo "  ✗ $$PASSED/4 passed, $$TOTAL failed"; \
		if [ $$LINT -eq 1 ];  then echo "    - lint:      FAILED"; fi; \
		if [ $$TYPES -eq 1 ]; then echo "    - typecheck: FAILED"; fi; \
		if [ $$TESTS -eq 1 ]; then echo "    - tests:     FAILED"; fi; \
		if [ $$BUILD -eq 1 ]; then echo "    - build:     FAILED"; fi; \
	fi; \
	echo "──────────────────────────────────────"; \
	echo ""; \
	exit $$TOTAL
