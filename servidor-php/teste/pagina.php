<?php session_start(); $_SESSION['usuario_id'] = 'perito1'; ?>
<!doctype html><meta charset="utf-8"><title>PeríciaFlow PHP — teste</title>
<h1>Perícia caso-42</h1>
<button data-pf-autos data-caso="caso-42" data-numero="5151870-23.2026.8.09.0051" data-codigo="AB12CD34">Baixar autos do PROJUDI</button>
<div data-pf-autos-status="caso-42"></div>
<script src="/js/pj-receptor.js"></script>
<script>PericiaFlowAutos.configurar({ api: "/api/autos-projudi.php",
  casos: () => [{ id: "caso-42", nome: "Perícia caso-42", numero: "5151870-23.2026.8.09.0051" }],
  criarCaso: async () => "caso-novo" });</script>
