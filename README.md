# GLPS · Painel de Cobranças

Painel para emitir e acompanhar boletos registrados pelo **Asaas**. Cada boleto sai com **Pix no mesmo documento** e pode ser enviado ao cliente pelo WhatsApp com um clique.

## O que o painel faz

- Planos de exemplo de **Emissão para CNPJ LTDA** (escondidos; para mostrar, mude `MOSTRAR_PLANOS` para `true` em `public/app.js`): Anual (R$ 535,00 à vista no Pix, 50% off) e cartão de crédito de 1x (R$ 1.070,00) a 12x com juros de 2,99% a.m., com simulação de parcelas na tela inicial. O anual já vem marcado
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

## Notas e boletos

A aba **Notas e boletos** (`/planilha`) controla as notas emitidas para as concessionárias, os vencimentos (data da nota + prazo) e os recebimentos, como uma planilha: dá para editar direto nas células, adicionar e apagar linhas, marcar a nota como paga, importar o `.xlsx` e baixar de volta em `.xlsx`.

**Boleto a partir das notas:** clique em **Gerar boleto** na linha da nota, ou marque várias notas da mesma concessionária (mesmo CNPJ) e use o botão **Gerar boleto** do topo para juntar tudo num boleto só. O boleto é criado no Asaas com a concessionária como cliente e vencimento previsto da nota (data + prazo). Ao abrir a página, o painel consulta o Asaas: boleto pago marca a nota como **Pago**; boleto cancelado no Asaas libera a nota para gerar de novo.

Para os dados ficarem salvos no servidor (e aparecerem em qualquer aparelho), conecte um banco **Upstash for Redis** ao projeto na Vercel (Storage → Create → Upstash for Redis → conectar ao projeto) e faça o Redeploy. A integração cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`. Sem o banco, a planilha funciona, mas fica salva só no navegador em que foi usada.

Os dados da planilha **não** ficam no código (o repositório é público): eles entram pelo botão **Importar .xlsx** e ficam no banco, protegidos pela senha do painel.

## Mudar preços dos planos

Os valores ficam no começo da seção de planos em `public/app.js` (`PRODUTO`, `AVISO_PLANOS`, `VALOR_CHEIO`, `JUROS_CARTAO_MES` e `PLANOS`).

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
