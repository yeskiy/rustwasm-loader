extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn triangular(n: u32) -> u32 {
    (1..=n).sum()
}

#[wasm_bindgen]
pub fn shout(s: &str) -> String {
    s.to_uppercase() + "!"
}
