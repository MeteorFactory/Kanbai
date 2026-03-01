.PHONY: dev build clean install lint format test typecheck build-app app app-win

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
	npx tsc -p tsconfig.main.json --noEmit
	npx tsc -p tsconfig.renderer.json --noEmit

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
