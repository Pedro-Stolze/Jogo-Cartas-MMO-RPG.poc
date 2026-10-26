# Os Reinados

Jogo de cartas de fantasia para partidas de teste contra uma IA. Usa HTML, CSS e JavaScript sem dependências externas. As 140 cartas do catálogo foram transcritas dos dados do projeto; consulte [as regras da partida](docs/regras.md).

## Jogar no Windows

1. Instale o [Node.js](https://nodejs.org/).
2. Abra um terminal nesta pasta e execute `node server.js`.
3. Acesse [http://localhost:8088](http://localhost:8088).
4. Para encerrar, volte ao terminal e pressione `Ctrl+C`.

Para usar outra porta, execute `$env:PORT=8090` e depois `node server.js`.

## Estrutura

- `src/`: interface e lógica da partida.
- `data/cards.json`: cartas, reinos, atributos, efeitos e raridades.
- `assets/card-art/`: uma ilustração otimizada para cada carta, agrupada pelo reino usado na partida. As artes foram recortadas das imagens originais dos decks para deixar o jogo leve.
- `docs/regras.md`: regras implementadas e observacoes sobre o prototipo.
- `server.js`: servidor local sem dependencias.

As imagens originais dos decks (mais de 1 GB) e os documentos-fonte permanecem na pasta de trabalho. Cada carta do jogo tem sua própria ilustração recortada e otimizada no repositório. Como alguns reinos não têm um deck de imagens com o mesmo nome, essas artes usam o conjunto visual mais próximo disponível nas pastas existentes.
