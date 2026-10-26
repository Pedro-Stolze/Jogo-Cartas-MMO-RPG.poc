# Organização das ilustrações

Cada registro em `data/cards.json` aponta, pelo ID da carta, para uma ilustração JPG em `assets/card-art/`. Assim, cada uma das 140 cartas tem sua própria imagem leve, e a tela mostra o nome do reino separado da arte.

As ilustrações foram recortadas e redimensionadas a partir dos arquivos das pastas de decks que já existiam no projeto:

| Reino mostrado no jogo | Pasta de imagens usada |
| --- | --- |
| Fadas | `DECK DAS FADAS` |
| Orcs | `DECK GOBLIN` |
| Natureza | `DECK DAS FADAS` |
| Dragões | `DECK ATLANTIDA` |
| Tribo | `DECK MONGE` |
| Animais | `DECK HUMANOS` |
| Fogo | `DECK ANÃO` |

Como algumas cartas não têm um deck de imagens com o mesmo nome e os arquivos ainda não identificam exatamente o nome da carta retratada, as artes são distribuídas pela ordem dos arquivos disponíveis no deck de origem. Quando um deck tem menos imagens que cartas, algumas imagens são reutilizadas. Os diretórios originais de imagem, com arquivos de alta resolução, permanecem na pasta de trabalho e não são necessários para executar a versão publicada.
