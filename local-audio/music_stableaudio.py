#!/usr/bin/env python3
"""Musica local com Stable Audio Open 1.0 (Stability AI Community License).

Uso:  python music_stableaudio.py "<prompt>" <saida.wav> <segundos (max 47)> [seed]
Exemplo de prompt: "epic cinematic hybrid orchestral electronic trailer music, 120 BPM, D minor,
                    pulsing synth bass, taiko drums, soaring strings, instrumental"
Pedir sempre o BPM no prompt e depois medir o real com beats.py. Para > 47 s gerar 2 segmentos
(build + drop) e juntar no mix.py (o segmento A e repetido por compassos ate ao drop).

Licenca: o modelo e "gated" no Hugging Face (aceitar a licenca e ter um token read em
~/.cache/huggingface/token). A Community License permite uso comercial a entidades com receita
anual < 1 M USD; acima disso e precisa licenca Enterprise. Confirmar os termos actuais.
"""
import sys

import soundfile as sf
import torch

sys.setrecursionlimit(100000)
from diffusers import StableAudioPipeline  # noqa: E402
import diffusers.schedulers.scheduling_cosine_dpmsolver_multistep as _cos  # noqa: E402

# O BrownianTree do torchsde entra em recursao infinita no MPS (torchsde 0.2.6).
# Ruido gaussiano independente por passo, com semente, e equivalente para este sampler.
_gen = torch.Generator("cpu")


class _GaussNoise:
    def __init__(self, x, sigma_min, sigma_max, seed=None, transform=lambda v: v):
        self.shape, self.dev, self.dt = x.shape, x.device, x.dtype
        _gen.manual_seed(int(seed[0] if isinstance(seed, (list, tuple)) else (seed or 0)))

    def __call__(self, sigma, sigma_next):
        return torch.randn(self.shape, generator=_gen).to(self.dev, self.dt)


_cos.BrownianTreeNoiseSampler = _GaussNoise

prompt, out, secs = sys.argv[1], sys.argv[2], float(sys.argv[3])
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 0
dev = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
pipe = StableAudioPipeline.from_pretrained("stabilityai/stable-audio-open-1.0", torch_dtype=torch.float32).to(dev)
g = torch.Generator("cpu").manual_seed(seed)
audio = pipe(prompt, negative_prompt="low quality, noise, vocals, voice, singing", num_inference_steps=100,
             audio_end_in_s=min(secs, 47.0), num_waveforms_per_prompt=1, generator=g).audios
sf.write(out, audio[0].T.float().cpu().numpy(), pipe.vae.sampling_rate)
print("ok", dev, pipe.vae.sampling_rate, out)
