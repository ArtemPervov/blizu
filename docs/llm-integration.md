# AI помощник Blizu

После включения `LLM_ENABLED` кнопка «AI помощник» открывает чат на текущей странице Blizu. Гости могут задавать вопросы без аккаунта. Ответ появляется частями по мере генерации. Адрес `/assistant` открывает чат на главной странице.

## Ollama уже запущена

Этот раздел подходит, если вы уже создали сеть `blizu_llm` (тип `bridge`) и загрузили модель. `inference` — имя, под которым файл Compose стека Blizu ссылается на эту сеть.

1. В Portainer откройте **Networks → blizu_llm** и проверьте, что к сети подключён контейнер Ollama. В примере ниже он имеет сетевой алиас `blizu-ollama`. Если в стеке Ollama сервис называется `ollama` и алиас не задан, используйте `ollama` как имя хоста.
2. В **Stacks → blizu → Environment variables** установите переменные чата. В `LLM_BASE_URL` укажите имя или алиас контейнера Ollama в сети `blizu_llm`.

   ```dotenv
   LLM_ENABLED=true
   LLM_BASE_URL=http://blizu-ollama:11434
   LLM_MODEL=qwen3:8b
   LLM_KEEP_WARM=true
   LLM_TIMEOUT_MS=45000
   ```

3. Сохраните настройки и выполните **Pull and redeploy**. Стек из Git использует [основной Compose](../docker-compose.yml), который собирает образы `api` и `web` из исходников и подключает `api` к сети `blizu_llm`. Для запуска из локальной копии репозитория используйте `docker compose up -d --build`. [Настройки стека из Git](https://docs.portainer.io/user/docker/stacks/edit#pull-and-redeploy)

4. В **Containers → контейнер Blizu API → Console** запустите `/bin/sh` и выполните команду. Если у вас имя хоста `ollama`, замените `blizu-ollama` в команде.

   ```sh
   node -e 'fetch("http://blizu-ollama:11434/api/tags", {signal: AbortSignal.timeout(5000)}).then(async r => { if (!r.ok) throw Error(String(r.status)); console.log((await r.json()).models.map(m => m.name)) }).catch(e => { console.error(e); process.exitCode = 1 })'
   ```

   В списке должна появиться `qwen3:8b`. Ошибка `ENOTFOUND` означает, что API не разрешает указанное имя контейнера. Сверьте алиас и проверьте, что **оба** контейнера отображаются в сети `blizu_llm`. Пустой список моделей означает, что Ollama доступна, но модель ещё нужно загрузить в этом контейнере командой `ollama pull qwen3:8b`. [Проверка списка моделей](https://docs.ollama.com/api/tags)

5. После обновления откройте чат в Blizu и задайте вопрос «Где посмотреть мои заказы?». На короткое приветствие Blizu отвечает сразу. Для вопросов к Ollama текст появляется по мере генерации через Nginx и Express. При `LLM_KEEP_WARM=true` Blizu загружает модель в фоне при запуске API и просит Ollama держать её в RAM или VRAM. При `LLM_KEEP_WARM=false` предварительная загрузка отключается и Ollama держит модель в памяти 15 минут после запроса. Для локального Node-процесса с Ollama на том же ПК укажите `LLM_BASE_URL=http://127.0.0.1:11434`. [Прогрев модели в Ollama](https://docs.ollama.com/faq#how-can-i-preload-a-model-into-ollama-to-get-faster-response-times) · [Настройка Nginx Blizu](../deploy/nginx.conf)

## Что умеет помощник

| Запрос | Результат |
| --- | --- |
| «Найди объявление по авто» | Показывает до четырёх карточек из каталога и ссылку на все совпадения. Поиск выполняется сразу, без вызова Ollama. |
| «Найди чистку кондиционера в Будве до 50 €» | Передаёт в каталог ключевые слова, город и верхнюю границу цены. Можно открыть подходящую карточку прямо из чата. |
| «Найди мне объявления по сухожарам» | Ищет по ключевым словам во всех городах и учитывает формы слов. Совпадения в названии показывает первыми. |
| «Найди вентиляторы в Подгорице» | Показывает объявления с подходящими словами и указанным городом. |
| «Открой объявления по авто» | Открывает карточку при одном совпадении или каталог с выбранными фильтрами при нескольких. |
| «Размести объявление о продаже велосипеда в Баре за 130 €» | Уточняет недостающие поля, готовит черновик и открывает заполненную форму. Объявление появится после того, как пользователь с правом публикации отправит форму. |
| «Создай заявку на ремонт крана в Будве» | Готовит заявку в разделе «Заявки». После входа пользователь проверяет и отправляет её из заполненной формы. Бюджет можно оставить открытым. |

Enter отправляет сообщение, а Ctrl+Enter добавляет новую строку. На телефоне чат открывается на весь экран. Для переноса строки на сенсорной клавиатуре используйте кнопку «Новая строка» рядом с кнопкой отправки.

Поиск доступен гостям. Express использует тот же запрос к базе, что и каталог. Обычные команды поиска Blizu обрабатывает напрямую. Для остальных запросов Ollama может выделить ключевые слова. Город, цену и категорию Blizu берёт из запроса пользователя. [Вызов функций в Ollama](https://docs.ollama.com/capabilities/tool-calling)

## 1. Запустить модель

Начните с `qwen3:8b`, которая поддерживает вызов функций. Для сервера с ограниченными ресурсами попробуйте `qwen3:4b` и сравните точность поиска и заполнения полей на русском, английском и черногорском. Размер файла модели на диске составляет около 5,2 ГБ для 8B и 2,5 ГБ для 4B. Для инференса нужна дополнительная оперативная память или VRAM. [Qwen3 8B](https://ollama.com/library/qwen3:8b) · [Qwen3 4B](https://ollama.com/library/qwen3:4b)

1. На том же Docker-хосте, где находится Blizu, создайте сеть `blizu_llm` с драйвером `bridge` через **Networks → Add network** в Portainer.
2. Откройте **Stacks → Add stack → Web editor** и создайте отдельный стек `blizu-llm` с этим Compose. В примере выбран CPU-вариант. Для регулярных обновлений закрепите протестированную версию образа или его digest. [Стек в Portainer](https://docs.portainer.io/user/docker/stacks/add) · [Ollama на Docker и GPU](https://docs.ollama.com/docker)

   ```yaml
   services:
     ollama:
       image: ollama/ollama:latest
       restart: unless-stopped
       environment:
         OLLAMA_HOST: "0.0.0.0:11434"
         OLLAMA_NO_CLOUD: "1"
       volumes:
         - ollama_models:/root/.ollama
       networks:
         inference:
           aliases:
             - blizu-ollama
   volumes:
     ollama_models:
   networks:
     inference:
       external: true
       name: blizu_llm
   ```

3. В **Containers → контейнер Ollama → Console** откройте `/bin/sh`. Загрузите модель и проверьте ответ. Дождитесь загрузки модели перед подключением чата. [Команды Ollama](https://docs.ollama.com/docker)

   ```sh
   ollama pull qwen3:8b
   ollama list
   ollama run qwen3:8b "Ответь на русском одним предложением. Что ты умеешь?"
   ```

4. Подключите сеть к Blizu и проверьте список моделей в консоли API по шагам из раздела [«Ollama уже запущена»](#ollama-уже-запущена). Порт `11434` доступен внутри Docker-сети. Nginx Proxy Manager направляет браузер на `blizu-web:8080`, а Nginx проксирует `/api/` к Express. [Сети Docker Compose](https://docs.docker.com/compose/how-tos/networking/) · [Nginx Blizu](../deploy/nginx.conf)

   ```sh
   node -e 'fetch("http://blizu-ollama:11434/api/tags").then(async r => { if (!r.ok) throw Error(String(r.status)); console.log((await r.json()).models.map(m => m.name)) }).catch(e => { console.error(e); process.exitCode = 1 })'
   ```

5. После деплоя новой версии задайте значения в **Stacks → blizu → Environment variables**. При локальной разработке с Ollama на том же ПК используйте `LLM_BASE_URL=http://127.0.0.1:11434` в `.env`. [Настройки API](../server/index.ts) · [Compose для Portainer](../docker-compose.portainer.yml)

   ```dotenv
   LLM_ENABLED=false
   LLM_BASE_URL=http://blizu-ollama:11434
   LLM_MODEL=qwen3:8b
   LLM_KEEP_WARM=true
   LLM_TIMEOUT_MS=45000
   ```

   `LLM_ENABLED` включает чат и его API. Выставьте `true` в тестовом окружении после сборки. `LLM_TIMEOUT_MS` задаёт время ожидания ответа. В текущем Nginx у API установлен `proxy_read_timeout 60s`. Если на CPU холодный старт не укладывается в ожидание, измерьте время с 4B и с прогретой моделью. [Параметры Ollama Chat API](https://docs.ollama.com/api/chat)

## Проверка после обновления

1. Без входа напишите «Найди объявление по авто». Проверьте карточки и ссылку на каталог. Затем попробуйте поиск с городом и бюджетом.
2. Попросите «Открой объявления по авто» и проверьте переход по найденным предложениям.
3. Попросите разместить товар или услугу. Когда помощник предложит черновик, нажмите «Проверить и опубликовать», проверьте поля и обложку. Для публикации нужен вход с правом размещать объявления. Действуют те же правила, что и у обычной формы Blizu. [Форма объявления](../src/forms.tsx) · [Маршрут публикации](../server/app.ts)
