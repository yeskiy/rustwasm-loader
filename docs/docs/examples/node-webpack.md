---
sidebar_position: 3
---

# Node.js Webpack Example

This example demonstrates how to use rust-wasmpack-loader in a Node.js application with Webpack. Perfect for server-side
applications, CLI tools, and backend services that need high-performance Rust code.

## Project Structure

```
node-webpack-example/
├── src/
│   ├── index.js          # Main Node.js entry
│   ├── lib.rs            # Rust WebAssembly code
│   └── utils.rs          # Additional Rust modules
├── dist/                 # Build output
├── tests/                # Test files
├── Cargo.toml           # Rust configuration
├── package.json         # Node.js dependencies
├── webpack.config.js    # Webpack configuration
└── test.webpack.config.js # Test configuration
```

## Setup Instructions

### 1. Initialize Project

```bash
mkdir my-node-wasm-app
cd my-node-wasm-app
npm init -y
```

### 2. Install Dependencies

```bash
# Install rust-wasmpack-loader and webpack
npm install --save-dev rust-wasmpack-loader webpack webpack-cli webpack-node-externals

# Install babel for modern JavaScript support
npm install --save-dev @babel/core @babel/preset-env babel-loader @babel/plugin-syntax-async-generators

# Install development tools
npm install --save-dev nodemon nodemon-webpack-plugin

# Install testing framework
npm install --save-dev jest

# Runtime dependency
npm install regenerator-runtime
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "node-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"

# For Node.js specific features
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
```

### 4. Configure Webpack

```javascript title="webpack.config.js"
const path = require("path");
const nodeExternals = require("webpack-node-externals");
const NodemonPlugin = require("nodemon-webpack-plugin");

module.exports = {
    mode: "development",
    entry: ["regenerator-runtime/runtime", "./src/index.js"],
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true
    },
    target: "async-node",
    node: false,
    externals: nodeExternals(),
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                resolve: {
                    fullySpecified: false
                },
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"],
                        plugins: ["@babel/plugin-syntax-async-generators"]
                    }
                }
            },
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: ["@babel/preset-env"],
                            plugins: ["@babel/plugin-syntax-async-generators"]
                        }
                    },
                    {
                        loader: "rust-wasmpack-loader",
                        options: {
                            node: {
                                bundle: true
                            },
                            logLevel: "info"
                        }
                    }
                ]
            }
        ]
    },
    resolve: {
        extensions: [".js", ".ts"]
    },
    plugins: [
        new NodemonPlugin({
            script: path.resolve("./dist/bundle.js"),
            watch: [path.resolve("./dist")],
            ignore: [
                "*.js.map",
                "./src/**/*.js",
                "./src/**/*.ts",
                "swagger.json"
            ]
        })
    ],
    experiments: {
        syncWebAssembly: true
    }
};
```

### 5. Create Test Configuration

```javascript title="test.webpack.config.js"
const path = require("path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
    mode: "development",
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "test-bundle.js",
        clean: false
    },
    target: "async-node",
    node: false,
    externals: nodeExternals(),
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                resolve: {
                    fullySpecified: false
                },
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"],
                        plugins: ["@babel/plugin-syntax-async-generators"]
                    }
                }
            },
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: ["@babel/preset-env"],
                            plugins: ["@babel/plugin-syntax-async-generators"]
                        }
                    },
                    {
                        loader: "rust-wasmpack-loader",
                        options: {
                            node: {
                                bundle: true
                            }
                        }
                    }
                ]
            }
        ]
    },
    resolve: {
        extensions: [".js", ".ts"]
    },
    experiments: {
        syncWebAssembly: true
    }
};
```

### 6. Create Rust Code

```rust title="src/lib.rs"
use wasm_bindgen::prelude::*;
use js_sys::Promise;

// Export a simple greeting function
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Greetings from Rust running in Node.js!", name)
}

// Export a function for mathematical operations
#[wasm_bindgen]
pub fn calculate_prime_count(limit: u32) -> u32 {
    let mut count = 0;
    for num in 2..=limit {
        if is_prime(num) {
            count += 1;
        }
    }
    count
}

fn is_prime(n: u32) -> bool {
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

// Export a function for data processing
#[wasm_bindgen]
pub fn process_data(data: &[u8]) -> Vec<u8> {
    // Example: simple data transformation
    data.iter()
        .map(|&byte| {
            // Apply some transformation (e.g., encryption-like operation)
            byte.wrapping_add(1).wrapping_mul(3) % 256
        })
        .collect()
}

// Export a function for string processing
#[wasm_bindgen]
pub fn analyze_text(text: &str) -> String {
    let word_count = text.split_whitespace().count();
    let char_count = text.chars().count();
    let line_count = text.lines().count();

    format!(
        "Text Analysis:\n- Words: {}\n- Characters: {}\n- Lines: {}",
        word_count, char_count, line_count
    )
}

// Export a function for performance testing
#[wasm_bindgen]
pub fn heavy_computation(iterations: u32) -> f64 {
    let mut result = 0.0;
    for i in 0..iterations {
        result += (i as f64).sin().cos().tan().abs();
    }
    result
}

// Export a function that works with JSON-like data
#[wasm_bindgen]
pub fn process_numbers(numbers: &[f64]) -> Vec<f64> {
    numbers.iter()
        .map(|&x| x * x + 2.0 * x + 1.0) // f(x) = x² + 2x + 1
        .collect()
}
```

### 7. Create Node.js Entry Point

```javascript title="src/index.js"
import module from "./lib.rs";

async function main() {
    try {
        console.log("🦀 Loading Rust WebAssembly module...");

        // Load the WASM module
        if (typeof module !== "undefined") {
            console.log("✅ WebAssembly module loaded successfully!");
        }

        // Test basic functionality
        const greeting = module.greet("Node.js Developer");
        console.log(greeting);

        // Test mathematical operations
        console.log("\n📊 Mathematical Operations:");
        const primeCount = module.calculate_prime_count(1000);
        console.log(`Prime numbers up to 1000: ${primeCount}`);

        // Test data processing
        console.log("\n🔄 Data Processing:");
        const inputData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const processedData = module.process_data(inputData);
        console.log("Input data:", Array.from(inputData));
        console.log("Processed data:", Array.from(processedData));

        // Test text analysis
        console.log("\n📝 Text Analysis:");
        const sampleText = `
            Rust and WebAssembly provide excellent performance
            for computationally intensive tasks in Node.js applications.
            This combination offers near-native speed with memory safety.
        `;
        const analysis = module.analyze_text(sampleText.trim());
        console.log(analysis);

        // Test performance
        console.log("\n⚡ Performance Test:");
        const start = process.hrtime.bigint();
        const result = module.heavy_computation(1000000);
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds

        console.log(`Heavy computation result: ${result.toFixed(6)}`);
        console.log(`Execution time: ${duration.toFixed(2)}ms`);

        // Test array processing
        console.log("\n🔢 Array Processing:");
        const numbers = [1, 2, 3, 4, 5];
        const processed = module.process_numbers(numbers);
        console.log("Input numbers:", numbers);
        console.log("Processed (f(x) = x² + 2x + 1):", Array.from(processed));

        console.log("\n🎉 All tests completed successfully!");

    } catch (error) {
        console.error("❌ Error loading or executing WASM module:", error);
        process.exit(1);
    }
}

// Export for testing
export { main };

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
```

### 8. Create Test File

```javascript title="tests/wasm.test.js"
import wasmModule from "../src/lib.rs";

describe("Rust WebAssembly Module", () => {
    let module;

    beforeAll(async () => {
        module = wasmModule;
    });

    test("should greet correctly", () => {
        const result = module.greet("Test User");
        expect(result)
            .toContain("Hello, Test User!");
        expect(result)
            .toContain("Node.js");
    });

    test("should calculate prime count correctly", () => {
        const result = module.calculate_prime_count(10);
        expect(result)
            .toBe(4); // Primes up to 10: 2, 3, 5, 7
    });

    test("should process data correctly", () => {
        const input = new Uint8Array([1, 2, 3]);
        const result = module.process_data(input);
        expect(result)
            .toHaveLength(3);
        expect(Array.from(result))
            .toEqual([6, 9, 12]);
    });

    test("should analyze text correctly", () => {
        const text = "Hello world test";
        const result = module.analyze_text(text);
        expect(result)
            .toContain("Words: 3");
        expect(result)
            .toContain("Characters: 16");
    });

    test("should perform heavy computation", () => {
        const result = module.heavy_computation(1000);
        expect(typeof result)
            .toBe("number");
        expect(result)
            .toBeGreaterThan(0);
    });

    test("should process numbers array", () => {
        const input = [1, 2, 3];
        const result = module.process_numbers(input);
        expect(Array.from(result))
            .toEqual([4, 9, 16]); // f(x) = x² + 2x + 1
    });
});
```

### 9. Update Package.json

```json title="package.json"
{
    ...,
    "scripts": {
        "start": "webpack --config webpack.config.js --watch",
        "build": "webpack --config webpack.config.js --mode production",
        "test": "webpack --config test.webpack.config.js && jest tests/wasm.test.js",
        "dev": "npm start"
    },
    ...
}
```

## Running the Example

### Development Mode

```bash
# Start development with hot reload
npm start

# The application will rebuild automatically when files change
```

### Production Build

```bash
# Build for production
npm run build

# Run the built application
node dist/bundle.js
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test -- --watch
```

---

:::tip Server Performance 🚀
Node.js + Rust WebAssembly can provide significant performance improvements for CPU-intensive server operations!
:::
