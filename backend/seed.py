"""Conjunto básico de categorias, pictogramas e frases do Minha Voz.

Cada pictograma: (nome, emoji, texto_falado). Quando o texto falado é None,
o próprio nome é usado. O campo `image_path` permite substituir o emoji por
uma imagem real/pictograma padronizado no futuro.
"""

DEFAULT_CATEGORIES = [
    # key, name, emoji, color token
    ("pessoas", "Pessoas", "👨‍👩‍👧", "categoryPeople"),
    ("acoes", "Ações", "🏃", "categoryActions"),
    ("alimentos", "Alimentos", "🍎", "categoryNouns"),
    ("bebidas", "Bebidas", "🥤", "categoryNouns"),
    ("sentimentos", "Sentimentos", "❤️", "categoryFeelings"),
    ("lugares", "Lugares", "🏠", "categoryPlaces"),
    ("necessidades", "Necessidades", "🆘", "categoryNeeds"),
    ("atividades", "Atividades", "🎮", "categoryActivities"),
    ("escola", "Escola", "🏫", "categorySchool"),
]

DEFAULT_PICTOGRAMS = {
    "pessoas": [
        ("Eu", "👤", None), ("Você", "🫵", None), ("Mamãe", "👩", "Mamãe"),
        ("Papai", "👨", "Papai"), ("Vovó", "👵", "Quero falar com a vovó."),
        ("Vovô", "👴", "Quero falar com o vovô."), ("Professora", "👩‍🏫", None),
        ("Amigo", "🧒", None), ("Irmão", "👦", None), ("Irmã", "👧", None),
        ("Médico", "🧑‍⚕️", None), ("Terapeuta", "🧑‍💼", None),
    ],
    "acoes": [
        ("Quero", "🙌", "Eu quero."), ("Não quero", "🙅", "Eu não quero."),
        ("Comer", "🍽️", None), ("Beber", "🥛", None), ("Brincar", "🧸", None),
        ("Dormir", "😴", None), ("Ir", "🚶", None), ("Ver", "👀", None),
        ("Ouvir", "👂", None), ("Ajudar", "🤝", "Me ajuda, por favor."),
        ("Parar", "✋", "Pare, por favor."), ("Gostar", "👍", None),
        ("Abraçar", "🤗", "Quero um abraço."), ("Tomar banho", "🚿", None),
    ],
    "alimentos": [
        ("Pão", "🍞", None), ("Fruta", "🍎", None), ("Banana", "🍌", None),
        ("Arroz", "🍚", None), ("Feijão", "🫘", None), ("Biscoito", "🍪", None),
        ("Ovo", "🥚", None), ("Frango", "🍗", None), ("Lanche", "🥪", None),
        ("Sorvete", "🍦", None), ("Pizza", "🍕", None), ("Bolo", "🎂", None),
    ],
    "bebidas": [
        ("Água", "💧", None), ("Suco", "🧃", None), ("Leite", "🥛", None),
        ("Achocolatado", "🍫", None), ("Refrigerante", "🥤", None), ("Chá", "🍵", None),
    ],
    "sentimentos": [
        ("Feliz", "😊", "Estou feliz."), ("Triste", "😢", "Estou triste."),
        ("Bravo", "😠", "Estou bravo."), ("Com medo", "😨", "Estou com medo."),
        ("Cansado", "😩", "Estou cansado."), ("Calmo", "😌", "Estou calmo."),
        ("Nervoso", "😰", "Estou nervoso."), ("Amor", "❤️", "Eu te amo."),
        ("Gostei", "👍", "Eu gostei."), ("Não gostei", "👎", "Eu não gostei."),
    ],
    "lugares": [
        ("Casa", "🏠", None), ("Escola", "🏫", None), ("Parque", "🌳", None),
        ("Banheiro", "🚻", "Quero ir ao banheiro."), ("Quarto", "🛏️", None),
        ("Cozinha", "🍳", None), ("Rua", "🛣️", None), ("Mercado", "🛒", None),
        ("Hospital", "🏥", None), ("Carro", "🚗", None),
    ],
    "necessidades": [
        ("Fome", "🍽️", "Estou com fome."), ("Sede", "💧", "Estou com sede."),
        ("Dor", "🤕", "Estou com dor."), ("Ajuda", "🆘", "Preciso de ajuda."),
        ("Frio", "🥶", "Estou com frio."), ("Calor", "🥵", "Estou com calor."),
        ("Sono", "😴", "Estou com sono."), ("Descansar", "🛋️", "Quero descansar."),
        ("Silêncio", "🤫", "Preciso de silêncio."), ("Sim", "✅", "Sim."),
        ("Não", "❌", "Não."), ("Por favor", "🙏", "Por favor."),
        ("Obrigado", "💛", "Obrigado."),
    ],
    "atividades": [
        ("Desenhar", "🎨", None), ("Música", "🎵", None), ("Televisão", "📺", None),
        ("Jogar", "🎮", None), ("Bola", "⚽", None), ("Ler", "📚", None),
        ("Passear", "🚶", None), ("Tablet", "📱", None), ("Massinha", "🧩", None),
    ],
    "escola": [
        ("Abrir o livro", "📖", "Vou abrir o livro."), ("Fechar o livro", "📕", "Vou fechar o livro."),
        ("Pegar o lápis", "✏️", "Vou pegar o lápis."), ("Fazer atividade", "📝", "Vou fazer a atividade."),
        ("Guardar o material", "📚", "Vou guardar o material."), ("Levantar a mão", "🙋", "Professora, posso falar?"),
        ("Ir ao banheiro", "🚻", "Professora, posso ir ao banheiro?"),
        ("Beber água", "🥤", "Professora, posso beber água?"), ("Lanche", "🍎", "Está na hora do lanche?"),
        ("Sentar", "🪑", "Vou sentar."), ("Escutar", "👂", "Estou escutando."),
        ("Esperar", "⏰", "Vou esperar."), ("Terminei", "✅", "Professora, eu terminei."),
        ("Não entendi", "❓", "Professora, eu não entendi. Pode me ajudar?"),
        ("Preciso de ajuda", "🆘", "Professora, preciso de ajuda."),
        ("Pode repetir?", "🔁", "Professora, pode repetir, por favor?"),
    ],
}

DEFAULT_FAVORITES = {"Eu", "Quero", "Água", "Banheiro", "Ajuda", "Sim", "Não", "Mamãe"}

DEFAULT_PHRASES = [
    ("Estou com fome.", "🍽️"), ("Estou com sede.", "💧"), ("Quero ir ao banheiro.", "🚻"),
    ("Estou com dor.", "🤕"), ("Preciso de ajuda.", "🆘"), ("Não gostei.", "👎"),
    ("Sim.", "✅"), ("Não.", "❌"), ("Quero descansar.", "🛋️"),
    ("Não entendi.", "❓"), ("Pode repetir?", "🔁"),
]

DEFAULT_SETTINGS = {
    "pictogram_size": "grande",  # medio | grande | extra
    "text_size": "grande",  # normal | grande | extra
    "speech_rate": 1.0,
    "voice": "coral",
    "volume": 1.0,
    "hidden_categories": [],
    "history_enabled": True,
    "speak_on_tap": False,  # fala cada pictograma ao tocar
    "grid_columns": 3,
}
