# Bun Node.js Example

This example demonstrates how to use rust-wasmpack-loader with Bun runtime. Bun provides ultra-fast JavaScript execution
and simplified configuration, making it perfect for high-performance applications.

## Project Structure

```
node-bun-example/
├── src/
│   ├── index.js          # Main Bun entry point
│   ├── lib.rs            # Rust WebAssembly code
│   └── utils.rs          # Additional Rust modules
├── tests/                # Test files
├── Cargo.toml           # Rust configuration
├── package.json         # Dependencies and scripts
├── bunfig.toml          # Bun configuration
└── README.md            # Project documentation
```

## Setup Instructions

### 1. Install Bun

First, install Bun runtime:

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Verify installation
bun --version
```

### 2. Initialize Project

```bash
mkdir my-bun-wasm-app
cd my-bun-wasm-app
bun init -y
```

### 3. Install Dependencies

```bash
# Install rust-wasmpack-loader
bun add -d rust-wasmpack-loader

# Optional: testing framework
bun add -d bun-types
```

### 4. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "bun-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"

# For JavaScript interop
[dependencies.js-sys]
version = "0.3"

# Optional: for async operations
[dependencies.wasm-bindgen-futures]
version = "0.4"

# Optional: for serialization
[dependencies.serde]
version = "1.0"
features = ["derive"]

[dependencies.serde-wasm-bindgen]
version = "0.6"

# Optimize for size and speed
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
```

### 5. Configure Bun

```toml title="bunfig.toml"
# Basic configuration
preload = ["./node_modules/rust-wasmpack-loader/bun/preload.js"]

# Test configuration
[test]
preload = ["./node_modules/rust-wasmpack-loader/bun/preload.js"]

# Optional: custom configuration
# [install]
# cache = false
# 
# [run]
# bun = true
```

### 6. Create Rust Code

```rust title="src/lib.rs"
use wasm_bindgen::prelude::*;

// Export a greeting function
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Greetings from Rust running in Bun! 🚀", name)
}

// Export mathematical functions
#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[wasm_bindgen]
pub fn factorial(n: u32) -> u64 {
    match n {
        0 | 1 => 1,
        _ => (2..=n as u64).product(),
    }
}

// Export data processing functions
#[wasm_bindgen]
pub fn sort_numbers(numbers: &[f64]) -> Vec<f64> {
    let mut sorted = numbers.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    sorted
}

#[wasm_bindgen]
pub fn filter_positive(numbers: &[f64]) -> Vec<f64> {
    numbers.iter().filter(|&&x| x > 0.0).copied().collect()
}

// Export string processing functions
#[wasm_bindgen]
pub fn reverse_string(input: &str) -> String {
    input.chars().rev().collect()
}

#[wasm_bindgen]
pub fn count_words(text: &str) -> u32 {
    text.split_whitespace().count() as u32
}

#[wasm_bindgen]
pub fn to_uppercase(text: &str) -> String {
    text.to_uppercase()
}

// Export performance testing function
#[wasm_bindgen]
pub fn compute_pi(iterations: u32) -> f64 {
    let mut pi = 0.0;
    for i in 0..iterations {
        let term = if i % 2 == 0 { 1.0 } else { -1.0 };
        pi += term / (2.0 * i as f64 + 1.0);
    }
    pi * 4.0
}

// Export array operations
#[wasm_bindgen]
pub fn sum_array(numbers: &[f64]) -> f64 {
    numbers.iter().sum()
}

#[wasm_bindgen]
pub fn multiply_array(numbers: &[f64], factor: f64) -> Vec<f64> {
    numbers.iter().map(|&x| x * factor).collect()
}

// Export hash-like function for demonstration
#[wasm_bindgen]
pub fn simple_hash(input: &str) -> u32 {
    let mut hash = 0u32;
    for byte in input.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
    }
    hash
}

// Export validation functions
#[wasm_bindgen]
pub fn is_prime(n: u32) -> bool {
    if n < 2 {
        return false;
    }
    for i in 2..=(n as f64).sqrt() as u32 {
        if n % i == 0 {
            return false;
        }
    }
    true
}

#[wasm_bindgen]
pub fn is_palindrome(text: &str) -> bool {
    let cleaned: String = text.chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_lowercase().next().unwrap())
        .collect();

    cleaned == cleaned.chars().rev().collect::<String>()
}
```

### 7. Create Bun Entry Point

```javascript title="src/index.js"
import wasmModule from "./lib.rs";

async function main() {
    try {
        console.log("🚀 Loading Rust WebAssembly module in Bun...");

        // Load the WASM module
        if (typeof module !== "undefined") {
            console.log("✅ WebAssembly module loaded successfully!");
        }

        // Test basic functionality
        console.log("\n👋 Basic Functions:");
        const greeting = module.greet("Bun Developer");
        console.log(greeting);

        // Test mathematical operations
        console.log("\n🔢 Mathematical Operations:");
        console.log(`Fibonacci(15): ${module.fibonacci(15)}`);
        console.log(`Factorial(10): ${module.factorial(10)}`);
        console.log(`Is 17 prime? ${module.is_prime(17)}`);
        console.log(`Is 18 prime? ${module.is_prime(18)}`);

        // Test array operations
        console.log("\n📊 Array Operations:");
        const numbers = [3.14, -2.5, 7.8, -1.2, 9.9, 0.5];
        console.log("Original array:", numbers);
        console.log("Sorted:", module.sort_numbers(numbers));
        console.log("Positive only:", module.filter_positive(numbers));
        console.log("Sum:", module.sum_array(numbers));
        console.log("Multiplied by 2:", module.multiply_array(numbers, 2));

        // Test string operations
        console.log("\n📝 String Operations:");
        const text = "Hello Bun and Rust!";
        console.log(`Original: "${text}"`);
        console.log(`Reversed: "${module.reverse_string(text)}"`);
        console.log(`Uppercase: "${module.to_uppercase(text)}"`);
        console.log(`Word count: ${module.count_words(text)}`);
        console.log(`Simple hash: ${module.simple_hash(text)}`);

        // Test palindrome detection
        console.log("\n🔍 Palindrome Detection:");
        const palindromes = ["racecar", "hello", "A man a plan a canal Panama", "bun"];
        palindromes.forEach(word => {
            console.log(`"${word}" is palindrome: ${module.is_palindrome(word)}`);
        });

        // Performance test
        console.log("\n⚡ Performance Test:");
        const start = Bun.nanoseconds();
        const pi = module.compute_pi(1000000);
        const end = Bun.nanoseconds();
        const duration = (end - start) / 1000000; // Convert to milliseconds

        console.log(`Computed π ≈ ${pi.toFixed(10)}`);
        console.log(`Execution time: ${duration.toFixed(2)}ms`);
        console.log(`Actual π: ${Math.PI.toFixed(10)}`);
        console.log(`Difference: ${Math.abs(Math.PI - pi)
            .toFixed(10)}`);

        console.log("\n🎉 All tests completed successfully!");
        console.log(`🚀 Bun version: ${Bun.version}`);

    } catch (error) {
        console.error("❌ Error loading or executing WASM module:", error);
        process.exit(1);
    }
}

// Export for testing
export { main };

// Run if this is the main module
if (import.meta.main) {
    await main();
}
```

### 8. Create Test File

```javascript title="tests/wasm.test.js"
import { test, expect } from "bun:test";
import wasmModule from "../src/lib.rs";

let module;

// Setup before all tests
test.before(async () => {
    module = wasmModule;
});

test("should greet correctly", () => {
    const result = module.greet("Test User");
    expect(result)
        .toContain("Hello, Test User!");
    expect(result)
        .toContain("Bun");
});

test("should calculate fibonacci correctly", () => {
    expect(module.fibonacci(0))
        .toBe(0);
    expect(module.fibonacci(1))
        .toBe(1);
    expect(module.fibonacci(10))
        .toBe(55);
});

test("should calculate factorial correctly", () => {
    expect(module.factorial(0))
        .toBe(1);
    expect(module.factorial(5))
        .toBe(120);
    expect(module.factorial(10))
        .toBe(3628800);
});

test("should sort numbers correctly", () => {
    const input = [3, 1, 4, 1, 5, 9, 2, 6];
    const expected = [1, 1, 2, 3, 4, 5, 6, 9];
    expect(module.sort_numbers(input))
        .toEqual(expected);
});

test("should filter positive numbers", () => {
    const input = [-2, -1, 0, 1, 2, 3];
    const expected = [1, 2, 3];
    expect(module.filter_positive(input))
        .toEqual(expected);
});

test("should reverse string correctly", () => {
    expect(module.reverse_string("hello"))
        .toBe("olleh");
    expect(module.reverse_string("bun"))
        .toBe("nub");
});

test("should count words correctly", () => {
    expect(module.count_words("hello world"))
        .toBe(2);
    expect(module.count_words("one two three four"))
        .toBe(4);
});

test("should detect prime numbers", () => {
    expect(module.is_prime(2))
        .toBe(true);
    expect(module.is_prime(17))
        .toBe(true);
    expect(module.is_prime(4))
        .toBe(false);
    expect(module.is_prime(18))
        .toBe(false);
});

test("should detect palindromes", () => {
    expect(module.is_palindrome("racecar"))
        .toBe(true);
    expect(module.is_palindrome("A man a plan a canal Panama"))
        .toBe(true);
    expect(module.is_palindrome("hello"))
        .toBe(false);
});

test("should compute pi approximation", () => {
    const pi = module.compute_pi(100000);
    expect(pi)
        .toBeCloseTo(Math.PI, 3);
});

test("should sum array correctly", () => {
    const input = [1, 2, 3, 4, 5];
    expect(module.sum_array(input))
        .toBe(15);
});

test("should multiply array correctly", () => {
    const input = [1, 2, 3];
    const expected = [2, 4, 6];
    expect(module.multiply_array(input, 2))
        .toEqual(expected);
});
```

### 9. Update Package.json

```json title="package.json"
{
    ...,
    "scripts": {
        "start": "bun run src/index.js",
        "dev": "bun --watch src/index.js",
        "test": "bun test",
        "test:watch": "bun test --watch",
        "build": "bun build src/index.js --outdir dist --target bun",
        "clean": "rm -rf dist target"
    },
    ...
}
```

## Running the Example

### Development Mode

```bash
# Run the application
bun start

# Run with hot reload (restarts on file changes)
bun dev

# Run with specific Bun flags
bun --inspect src/index.js
```

### Testing

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test tests/wasm.test.js

# Run tests with coverage
bun test --coverage
```

### Production Build

```bash
# Build for production
bun build

# Run the built application
bun dist/index.js
```

## Advanced Configuration

### Custom Loader Configuration

Create a custom initialization file:

```javascript title="bun-init.js"
import { plugin } from "bun";
import loader from "rust-wasmpack-loader";

plugin(loader.bun({
    logLevel: "info",
    // Add custom options here
}));
```
And add it to your `bunfig.toml`:

```toml title="bunfig.toml"
preload = [
    "./bun-init.js"
]
```

---

:::tip Bun Performance 🚀
Bun can be 2-10x faster than Node.js for many workloads, and combined with Rust WebAssembly, provides exceptional
performance!
:::