# 🚀 Exportação Urgente — v036

> **Objetivo:** Executar exports de estatísticas usando scripts v036 enquanto v037 é estruturada  
> **Status:** 🟡 Em planejamento

---

## 📋 Scripts de Exportação

### Prioridade Alta

| Script | Descrição | Status | Output Esperado |
|--------|-----------|--------|-----------------|
| `bioma_modulo3.js` | Estatísticas por bioma | ⏳ Pendente | CSV por bioma |
| `uf_modulo3.js` | Estatísticas por UF | ⏳ Pendente | CSV por UF |
| `brasil_modulo3.js` | Estatísticas nacionais | ⏳ Pendente | CSV nacional |

### Prioridade Média

| Script | Descrição | Status | Output Esperado |
|--------|-----------|--------|-----------------|
| `bioma_uf_modulo3.js` | Estatísticas por bioma + UF | ⏳ Pendente | CSV cruzado |
| `brasil_priv_pa_modulo3.js` | Com áreas protegidas | ⏳ Pendente | CSV com PAs/TIs |

---

## 📝 Checklist de Execução

### Pré-Execução
- [ ] Verificar assets de entrada no GEE
- [ ] Confirmar escala e região de interesse
- [ ] Validar permissões de export

### Durante Execução
- [ ] Executar `bioma_modulo3.js`
- [ ] Executar `uf_modulo3.js`
- [ ] Executar `brasil_modulo3.js`
- [ ] Executar `bioma_uf_modulo3.js`
- [ ] Executar `brasil_priv_pa_modulo3.js`

### Pós-Execução
- [ ] Validar outputs (CSVs)
- [ ] Documentar erros/correções
- [ ] Atualizar `02-correcoes-pendentes.md`

---

## ⚠️ Pontos de Atenção

1. **Escala:** Confirmar se escala 30m está correta
2. **Região:** Verificar se geometry está definida
3. **Timeout:** Monitorar tempo de execução no GEE
4. **Quota:** Verificar limite de exportações

---

## 📊 Resultados

| Script | Data | Status | Observações |
|--------|------|--------|-------------|
|        |      |        |             |

---

*Atualizar este arquivo após cada execução.*
