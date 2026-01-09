use std::ffi::{CStr, CString};
use libc::c_char;

extern "C" {
    fn encrypt_data_ffi(input: *const c_char) -> *mut c_char;
    fn decrypt_data_ffi(input: *const c_char) -> *mut c_char;
    fn free_string_ffi(ptr: *mut c_char);
}

pub fn encrypt(data: &str) -> String {
    let c_data = CString::new(data).expect("CString failed");
    unsafe {
        let ptr = encrypt_data_ffi(c_data.as_ptr());
        let res = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        free_string_ffi(ptr);
        res
    }
}

pub fn decrypt(data: &str) -> String {
    let c_data = CString::new(data).expect("CString failed");
    unsafe {
        let ptr = decrypt_data_ffi(c_data.as_ptr());
        let res = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        free_string_ffi(ptr);
        res
    }
}
