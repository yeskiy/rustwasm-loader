pub fn capitalize(s: &str) -> String {
    s[0..1].to_uppercase() + &s[1..]
}
