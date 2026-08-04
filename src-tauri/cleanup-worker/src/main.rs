//! Standalone worker that runs the local cleanup LLM (llama.cpp via llama-cpp-2).
//!
//! Kept as a separate process/binary from the main NotePP app because whisper.cpp
//! (used in-process for dictation) and llama.cpp each statically vendor their own
//! copy of ggml with identical global symbol names — linking both into one binary
//! fails at link time with duplicate symbol errors. Running llama.cpp here instead
//! sidesteps that entirely.
//!
//! Protocol: reads one JSON object from stdin `{model_path, system_prompt, text}`,
//! writes one JSON object to stdout `{"text": "..."}` on success or `{"error": "..."}`
//! on failure, and exits 0/1 to match.

use std::io::Read;
use std::num::NonZeroU32;
use std::path::Path;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Request {
    model_path: String,
    system_prompt: String,
    text: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Response {
    Ok { text: String },
    Err { error: String },
}

fn main() {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        print_and_exit(Response::Err {
            error: format!("Erro ao ler entrada: {e}"),
        });
    }

    let request: Request = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => print_and_exit(Response::Err {
            error: format!("Entrada inválida: {e}"),
        }),
    };

    match run_cleanup(
        Path::new(&request.model_path),
        &request.system_prompt,
        &request.text,
    ) {
        Ok(text) => print_and_exit(Response::Ok { text }),
        Err(error) => print_and_exit(Response::Err { error }),
    }
}

fn print_and_exit(response: Response) -> ! {
    let is_err = matches!(response, Response::Err { .. });
    println!("{}", serde_json::to_string(&response).unwrap());
    std::process::exit(if is_err { 1 } else { 0 });
}

fn run_cleanup(model_path: &Path, system_prompt: &str, text: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    if !model_path.exists() {
        return Err("Modelo de limpeza não encontrado".to_string());
    }

    let backend = LlamaBackend::init().map_err(|e| format!("Erro ao iniciar motor de IA: {e}"))?;
    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
        .map_err(|e| format!("Erro ao carregar modelo de limpeza: {e}"))?;

    let full_prompt = format!(
        "<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n"
    );
    let tokens = model
        .str_to_token(&full_prompt, AddBos::Always)
        .map_err(|e| format!("Erro ao preparar texto: {e}"))?;

    // Cap generation to roughly the size of the input (cleanup should not invent content),
    // with a small floor so short utterances still get a full response.
    let max_new_tokens: i32 = ((text.chars().count() as i32) / 2 + 64).min(1024);
    let n_ctx_needed = (tokens.len() as u32 + max_new_tokens as u32 + 32).clamp(1024, 8192);

    let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(n_ctx_needed));
    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| format!("Erro ao criar contexto de IA: {e}"))?;

    let mut batch = LlamaBatch::new(tokens.len().max(512), 1);
    let last_index = tokens.len() as i32 - 1;
    for (i, token) in (0_i32..).zip(tokens.iter().copied()) {
        batch
            .add(token, i, &[0], i == last_index)
            .map_err(|e| format!("Erro ao preparar prompt: {e}"))?;
    }
    ctx.decode(&mut batch)
        .map_err(|e| format!("Erro ao processar prompt: {e}"))?;

    let mut sampler = LlamaSampler::chain_simple([LlamaSampler::temp(0.3), LlamaSampler::dist(1234)]);

    let mut n_cur = batch.n_tokens();
    let stop_at = tokens.len() as i32 + max_new_tokens;
    let mut decoder = encoding_rs::UTF_8.new_decoder();
    let mut output = String::new();

    while n_cur < stop_at {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);
        if model.is_eog_token(token) {
            break;
        }
        let piece = model
            .token_to_piece(token, &mut decoder, true, None)
            .map_err(|e| format!("Erro ao decodificar saída: {e}"))?;
        output.push_str(&piece);

        batch.clear();
        batch
            .add(token, n_cur, &[0], true)
            .map_err(|e| format!("Erro ao continuar geração: {e}"))?;
        n_cur += 1;
        ctx.decode(&mut batch)
            .map_err(|e| format!("Erro ao gerar texto: {e}"))?;
    }

    Ok(output.trim().to_string())
}
