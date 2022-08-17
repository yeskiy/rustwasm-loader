extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

#[no_mangle]
pub fn fibonacci_default(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_default(n - 1) + fibonacci_default(n - 2),
    }
}

#[wasm_bindgen]
pub fn fibonacci_bindgen(n: i32) -> i32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci_bindgen(n - 1) + fibonacci_bindgen(n - 2),
    }
}


#[wasm_bindgen]
pub fn cap(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}