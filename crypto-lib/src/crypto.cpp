#include "crypto.h"
#include <cstring>
#include <cstdlib>
#include <string>
#include <sstream>
#include <iomanip>
#include <vector>

// Ключ шифрования
const char KEY = 0x5A;

// Преобразование байт -> HEX строка (чтобы Rust не ломал кодировку)
std::string to_hex(const std::vector<unsigned char>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (unsigned char c : data) {
        ss << std::setw(2) << (int)c;
    }
    return ss.str();
}

// Преобразование HEX строка -> байты
std::vector<unsigned char> from_hex(const std::string& hex) {
    std::vector<unsigned char> data;
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char)strtol(byteString.c_str(), nullptr, 16);
        data.push_back(byte);
    }
    return data;
}

extern "C" {
    char* encrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string s_input(input);
        std::vector<unsigned char> encrypted;
        
        // XOR Шифрование + сдвиг
        for (char c : s_input) {
            unsigned char uc = (unsigned char)c;
            unsigned char res = (uc ^ KEY) + 1; 
            encrypted.push_back(res);
        }

        // Возвращаем как HEX строку (безопасно для UTF-8)
        std::string hex_res = to_hex(encrypted);
        char* out = (char*)malloc(hex_res.length() + 1);
        strcpy(out, hex_res.c_str());
        return out;
    }

    char* decrypt_data_ffi(const char* input) {
        if (!input) return nullptr;
        std::string s_hex(input);
        
        // Сначала декодируем HEX обратно в байты
        std::vector<unsigned char> encrypted_bytes = from_hex(s_hex);
        std::string decrypted;

        // Расшифровка
        for (unsigned char c : encrypted_bytes) {
            char res = (char)((c - 1) ^ KEY);
            decrypted += res;
        }

        char* out = (char*)malloc(decrypted.length() + 1);
        strcpy(out, decrypted.c_str());
        return out;
    }

    void free_string_ffi(char* ptr) {
        if (ptr) free(ptr);
    }
}
