use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: i32) -> i32 {
    shared::fibonacci(n)
}

#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    shared::capitalize(s)
}
