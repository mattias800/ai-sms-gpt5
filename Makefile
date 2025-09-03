.PHONY: help install build test benchmark clean verify all ci setup

# Default target
help:
	@echo "SMS Emulator Build System"
	@echo "========================="
	@echo ""
	@echo "Available targets:"
	@echo "  make setup      - Initial project setup"
	@echo "  make install    - Install dependencies"
	@echo "  make build      - Build the project"
	@echo "  make test       - Run all tests"
	@echo "  make verify     - Run verification tests"
	@echo "  make benchmark  - Run performance benchmarks"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make ci         - Run full CI pipeline"
	@echo "  make all        - Build and test everything"
	@echo ""
	@echo "Quick commands:"
	@echo "  make run-alex   - Run Alex Kidd ROM"
	@echo "  make run-sonic  - Run Sonic ROM"
	@echo "  make trace      - Trace execution"
	@echo ""

# Initial setup
setup:
	@echo "🔧 Setting up SMS Emulator..."
	npm install
	@echo "✅ Setup complete!"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm ci

# Build the project
build:
	@echo "🔨 Building project..."
	npm run build
	@echo "✅ Build complete!"

# Run all tests
test: build
	@echo "🧪 Running tests..."
	npm test
	npm run test:timing
	npm run test:vdp
	@echo "✅ All tests complete!"

# Run verification tests only
verify: build
	@echo "✔️ Running verification tests..."
	npm run verify

# Run performance benchmarks
benchmark: build
	@echo "📊 Running benchmarks..."
	npm run benchmark

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf coverage/
	rm -f test-report.json
	rm -f benchmark-results.json
	rm -f *.png
	@echo "✅ Clean complete!"

# Run full CI pipeline
ci:
	@echo "🚀 Running CI pipeline..."
	npm run ci

# Build and test everything
all: clean install build test benchmark
	@echo "✅ Full build and test complete!"

# Quick commands for running games
run-alex: build
	@echo "🎮 Running Alex Kidd..."
	npx tsx run.ts "Alex Kidd - The Lost Stars (UE) [!].sms"

run-sonic: build
	@echo "🎮 Running Sonic..."
	npx tsx run.ts sonic.sms

# Trace execution
trace: build
	@echo "🔍 Tracing execution..."
	npm run trace

# Development mode with file watching
watch:
	@echo "👁️ Starting watch mode..."
	npm run build
	npm run test:watch

# Format code
format:
	@echo "✨ Formatting code..."
	npm run format:fix

# Lint code
lint:
	@echo "🔍 Linting code..."
	npm run lint

# Show current test status
status: build
	@echo "📊 Current Test Status"
	@echo "====================="
	@npx tsx tools/verify_z80_timing.ts | grep -E "(✅|❌|Summary)" || true
	@echo ""
	@npx tsx tools/verify_vdp_timing.ts | grep -E "(✅|❌|Summary)" || true
