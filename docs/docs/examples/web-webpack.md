# Web Webpack example

This example shows how to use rust-wasmpack-loader in a browser application with Webpack. Use it when you want Rust code
running client-side as WebAssembly.

## Project structure

```
web-webpack-example/
├── src/
│   ├── index.js          # Main JavaScript entry
│   ├── lib.rs            # Rust WebAssembly code
│   └── utils.rs          # Additional Rust modules
├── dist/                 # Build output
├── Cargo.toml           # Rust configuration
├── package.json         # Node.js dependencies
├── webpack.config.js    # Webpack configuration
└── index.html          # HTML template
```

## Setup

### 1. Initialize the project

```bash
mkdir my-web-wasm-app
cd my-web-wasm-app
npm init -y
```

### 2. Install dependencies

```bash
# Install rust-wasmpack-loader and webpack
npm install --save-dev rust-wasmpack-loader webpack webpack-cli webpack-dev-server html-webpack-plugin

# Optional: TypeScript support
npm install --save-dev typescript ts-loader @types/node
```

### 3. Create Cargo.toml

```toml title="Cargo.toml"
[package]
name = "web-wasm-example"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.95"

[dependencies.web-sys]
version = "0.3"
features = [
    "console",
    "Document",
    "Element",
    "HtmlElement",
    "Window",
]

[dependencies.js-sys]
version = "0.3"
```

### 4. Configure Webpack

```javascript title="webpack.config.js"
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    mode: "development",
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js",
        clean: true
    },
    devServer: {
        static: {
            directory: path.join(__dirname, "dist")
        },
        compress: true,
        port: 9000,
        hot: true,
        open: true
    },
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: {
                        logLevel: "info"
                    }
                }
            },
            // Optional: TypeScript support
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [".js", ".ts", ".wasm"]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./src/index.html",
            title: "Rust WebAssembly App"
        })
    ],
    experiments: {
        asyncWebAssembly: true
    }
};
```

### 5. Create the Rust code

```rust title="src/lib.rs"
use wasm_bindgen::prelude::*;
use web_sys::console;

// Import the `console.log` function from the browser
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro for easier console logging
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Export a greeting function
#[wasm_bindgen]
pub fn greet(name: &str) {
    console_log!("Hello, {}! Greetings from Rust and WebAssembly!", name);
}

// Export a function to calculate fibonacci numbers
#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

// Export a function for image processing simulation
#[wasm_bindgen]
pub fn process_image_data(data: &[u8]) -> Vec<u8> {
    // Simple image processing: invert colors
    data.iter().map(|&pixel| 255 - pixel).collect()
}

// Export a function to demonstrate performance
#[wasm_bindgen]
pub fn heavy_computation(iterations: u32) -> f64 {
    let mut result = 0.0;
    for i in 0..iterations {
        result += (i as f64).sin().cos().tan();
    }
    result
}

// Called when the WASM module is instantiated
#[wasm_bindgen(start)]
pub fn main() {
    console_log!("Rust WebAssembly module loaded successfully!");
}
```

### 6. Create the JavaScript entry

Import the `.rs` file like any other module and call its exports.

```javascript title="src/index.js"
// Import the Rust module
import module from "./lib.rs";

// Wait for the module to load
console.log("WebAssembly module loaded!");

// Call Rust functions
module.greet("WebAssembly Developer");

// Calculate fibonacci
const fibResult = module.fibonacci(10);
console.log(`Fibonacci(10) = ${fibResult}`);

// Performance test
const start = performance.now();
const result = module.heavy_computation(1000000);
const end = performance.now();
console.log(`Heavy computation result: ${result}`);
console.log(`Execution time: ${end - start} milliseconds`);

// Update the DOM
document.body.innerHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1>🦀 Rust + WebAssembly + Webpack</h1>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Results:</h3>
            <p><strong>Fibonacci(10):</strong> ${fibResult}</p>
            <p><strong>Heavy computation:</strong> ${result.toFixed(6)}</p>
            <p><strong>Execution time:</strong> ${(end - start).toFixed(2)}ms</p>
        </div>
        <div style="background: #e8f4fd; padding: 20px; border-radius: 8px;">
            <h3>🎉 Success!</h3>
            <p>Your Rust code is running in the browser via WebAssembly!</p>
            <p>Check the browser console for more details.</p>
        </div>
    </div>
`;

// Image processing example
const imageData = new Uint8Array([255, 128, 64, 32, 16, 8, 4, 2]);
const processedData = module.process_image_data(imageData);
console.log("Original image data:", Array.from(imageData));
console.log("Processed image data:", Array.from(processedData));
```

### 7. Create the HTML template

```html title="src/index.html"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rust WebAssembly Example</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #loading {
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
        }
    </style>
</head>
<body>
<div id="loading">
    <h2>🦀 Loading Rust WebAssembly...</h2>
    <p>Please wait while we compile and load your Rust code.</p>
</div>
</body>
</html>
```

### 8. Update package.json

```json title="package.json"
{
    ...
    "scripts": {
        "start": "webpack serve --mode development",
        "build": "webpack --mode production",
        "dev": "webpack serve --mode development --open"
    },
    ...
}
```

## Running the example

### Development

```bash
# Start the development server
npm start

# Or with automatic browser opening
npm run dev
```

The app runs at `http://localhost:9000` with hot reload enabled.

### Production build

```bash
# Build for production
npm run build

# Serve the built files
npx serve dist
```

## Advanced configuration

### Async loading

To fetch the wasm as a separate asset instead of inlining it, enable async loading:

```javascript title="webpack.config.js"
module.exports = {
    // ... other config
    module: {
        rules: [
            {
                test: /\.rs$/,
                exclude: /node_modules/,
                use: {
                    loader: "rust-wasmpack-loader",
                    options: {
                        web: {
                            asyncLoading: true
                        }
                    }
                }
            }
        ]
    }
};
```

### TypeScript integration

Create a `tsconfig.json`:

```json title="tsconfig.json"
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "node",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": [
        "src/**/*"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ]
}
```

## Troubleshooting

### The WASM module does not load

- Check the browser console for errors.
- Make sure `experiments.asyncWebAssembly` is enabled. See [Can I use WebAssembly](https://caniuse.com/wasm) for browser support.
- Confirm the Rust build succeeded.

### The bundle is large

- Build in production mode.
- Set `asyncLoading: true` so the wasm loads as a separate asset.
- Trim your Rust dependencies.

---

:::tip Performance
For computationally intensive tasks, WebAssembly can run 10-100x faster than equivalent JavaScript.
:::
