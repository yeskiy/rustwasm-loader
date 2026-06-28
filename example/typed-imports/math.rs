extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}

#[wasm_bindgen]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
