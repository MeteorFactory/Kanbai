.PHONY: dev build clean install lint format test typecheck build-app app app-win check

STAMP = node_modules/.install-stamp

# Développement
dev: $(STAMP)
	npm run dev

# Installation des dépendances
install:
	npm install

$(STAMP): package.json
	npm install
	@node -e "require('fs').writeFileSync('node_modules/.install-stamp','')"

# Build Vite (main + preload + renderer)
build: $(STAMP)
	npm run build

# Package app
ifeq ($(OS),Windows_NT)
app: build
	npx electron-builder --win --publish never
else
app: build
	npx electron-builder --mac --publish never
endif

app-win: build
	npx electron-builder --win --publish never

build-app: app

# Qualité
lint: $(STAMP)
	npm run lint

lint-fix: $(STAMP)
	npm run lint:fix

format: $(STAMP)
	npm run format

typecheck: $(STAMP)
	npm run typecheck

# Tests
test: $(STAMP)
	npm run test

test-watch: $(STAMP)
	npm run test:watch

test-coverage: $(STAMP)
	npm run test:coverage

# Nettoyage
ifeq ($(OS),Windows_NT)
clean:
	if exist dist rmdir /s /q dist
	if exist release rmdir /s /q release
	if exist .vite rmdir /s /q .vite
else
clean:
	rm -rf dist release .vite
endif

# Pre-deploy check — runs the 4 CI conditions and prints a report
check: $(STAMP)
	@echo ""
	@echo "══════════════════════════════════════"
	@echo "  Mirehub — Pre-deploy Check"
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
