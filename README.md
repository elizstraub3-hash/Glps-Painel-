# GLPS · Painel de Cobranças

Painel para emitir e acompanhar boletos registrados pelo **Asaas**. Cada boleto sai com **Pix no mesmo documento** e pode ser enviado ao cliente pelo WhatsApp com um clique.

## O que o painel faz

- Planos prontos de **Emissão para CNPJ LTDA**: Anual (R$ 535,00 à vista no Pix, 50% off) e Mensal (12x de R$ 89,17 no cartão de crédito). O anual já vem marcado
- Cobranças por boleto (com Pix junto), Pix ou cartão de crédito
- Envia a comparação dos planos pelo WhatsApp, puxando o cliente para o anual
- Emite boletos avulsos à vista ou parcelados (até 12x), com multa, juros e desconto
- Busca e cadastra clientes (CPF ou CNPJ), sem cadastrar o mesmo cliente duas vezes
- Mostra a linha digitável, o Pix copia e cola, o QR Code e o PDF do boleto
- Envia o boleto pelo WhatsApp com uma mensagem pronta
- Dá baixa manual quando o cliente paga em dinheiro ou fora do boleto
- Cancela boletos
- Resume o mês: quanto há a receber, quanto está vencido e quanto já foi recebido

O status de cada boleto vem direto do Asaas, então quando o cliente paga, o boleto aparece como pago no painel sem você precisar fazer nada.

## Mudar preços dos planos

Os valores ficam no começo da seção de planos em `public/app.js` (`PRODUTO`, `VALOR_CHEIO` e `PLANOS`).

## Como colocar no ar (Vercel)

1. Crie a conta no [Asaas](https://www.asaas.com) com o CNPJ da GLPS e aguarde a aprovação.
2. No Asaas, cadastre uma **chave Pix** (necessária para cobranças Pix) e vá em **Minha Conta → Integrações → Chave de API** e gere uma chave.
3. Na Vercel, clique em **Add New → Project** e importe este repositório (`Glps-Painel-`). Não precisa mudar nenhuma configuração de build.
4. Em **Settings → Environment Variables**, cadastre:

   | Variável | Valor |
   |---|---|
   | `ASAAS_API_KEY` | a chave gerada no passo 2 |
   | `ASAAS_AMBIENTE` | `sandbox` para testar, `producao` para valer |
   | `PAINEL_SENHA` | a senha para entrar no painel |
   | `SESSION_SECRET` | opcional: um texto aleatório longo (ex.: `openssl rand -hex 32`) |

5. Faça o deploy.

> **Teste antes no sandbox.** Crie uma conta em [sandbox.asaas.com](https://sandbox.asaas.com), use a chave de lá com `ASAAS_AMBIENTE=sandbox` e emita alguns boletos de teste. Quando estiver tudo certo, troque para a chave de produção e `producao`. Enquanto estiver em sandbox, aparece uma etiqueta "SANDBOX" no topo do painel.

## Rodar no computador

```bash
cp .env.example .env   # preencha as variáveis
npm run dev            # abre em http://localhost:3000
```

Precisa de Node 18 ou mais novo. O projeto não usa nenhuma dependência externa.

## Segurança

- A chave do Asaas fica só no servidor (nas variáveis da Vercel) e nunca chega ao navegador.
- O login dura 12 horas, num cookie protegido (`HttpOnly`, `Secure`, `SameSite=Strict`).
- Nunca envie o arquivo `.env` para o GitHub. Ele já está no `.gitignore`.

## Estrutura

```
api/        funções do servidor (rodam na Vercel)
  sessao.js     login / logout
  clientes.js   buscar e cadastrar clientes
  cobrancas.js  listar e emitir boletos
  cobranca.js   detalhes, baixa manual e cancelamento
  resumo.js     totais do mês
lib/        cliente da API do Asaas e utilidades HTTP
public/     o painel (HTML, CSS e JS)
```
