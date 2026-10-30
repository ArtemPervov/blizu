# Переменные окружения для Portainer

Для `docker-compose.portainer.yml` задайте эти значения в **Stacks → Environment variables**. Для запуска через CLI используйте те же переменные в `.env` рядом с `docker-compose.yml`. Шаблон — [`.env.example`](../.env.example).

## Обязательно указать

| Переменная | Что указать | Пример |
| --- | --- | --- |
| `APP_ORIGIN` | Публичный адрес сервиса с `https://`, без пути и завершающего `/`. Должен совпадать с доменом в Nginx Proxy Manager. | `https://blizu.your-domain.me` |
| `ADMIN_EMAIL` | Ваш email для входа в аккаунт арбитра. Сервис не отправляет письма на этот адрес. | `you@example.com` |
| `ADMIN_PASSWORD` | Уникальный пароль арбитра длиной не меньше 12 символов. Задайте самостоятельно в Portainer; не коммитьте реальное значение. | Собственный пароль |

При первом запуске API создаёт аккаунт арбитра. Изменение `ADMIN_PASSWORD` в окружении **не изменяет пароль уже существующего аккаунта**. Если этот email уже зарегистрирован, новый аккаунт не создаётся и роль существующего аккаунта не изменяется.

## Можно оставить по умолчанию

| Переменная | По умолчанию | Когда менять |
| --- | --- | --- |
| `PROXY_NETWORK` | `proxy` | Если общая Docker-сеть с NPM называется иначе. Она должна существовать, и контейнер NPM должен быть подключён к ней. |
| `ENABLE_DEMO` | `false` | `true` включает вымышленные данные и вход под демо-ролями, включая арбитра. Используйте только для демонстрационного окружения. |
| `DELIVERY_STALE_HOURS` | `72` | Через сколько часов без обновления доставки автоматически открывать инцидент. Положительное число; проверка выполняется раз в минуту. |
| `BLIZU_IMAGE_PREFIX` | `blizu` | Префикс готовых Docker-образов. Например, `ghcr.io/artempervov/blizu` даст образы `ghcr.io/artempervov/blizu-api` и `ghcr.io/artempervov/blizu-web`. Эти образы сначала нужно собрать и опубликовать в своём registry. |
| `BLIZU_VERSION` | `latest` | Тег обоих готовых образов, например `1.0.0`. В registry или на Docker-хосте должен существовать указанный тег. |

`ENABLE_DEMO=false` не удаляет старые демонстрационные данные. Для реального запуска нужен чистый production-том; приложение отклоняет production-запуск с демо-аккаунтами при выключенном демо-режиме.

## Готовый набор для заполнения

```dotenv
APP_ORIGIN=https://blizu.your-domain.me
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=
PROXY_NETWORK=proxy
ENABLE_DEMO=false
DELIVERY_STALE_HOURS=72
BLIZU_IMAGE_PREFIX=blizu
BLIZU_VERSION=latest
```

Заполните `ADMIN_PASSWORD` и замените домен/email своими значениями. Пустой пароль намеренно не позволяет запустить Compose.

При использовании локальных образов с префиксом `blizu` перед созданием стека Portainer соберите их **на том же Docker-хосте**:

```bash
git clone https://github.com/ArtemPervov/blizu.git
cd blizu
cp .env.example .env
# Заполните .env своими значениями.
docker compose build
```

В Portainer используйте `docker-compose.portainer.yml` и отключите принудительное скачивание образов, если они собраны только локально. Для образов из registry настройте `BLIZU_IMAGE_PREFIX` и `BLIZU_VERSION` соответственно. Один Git push исходников сам по себе не создаёт Docker-образы.

## Уже заданы в стеке

Эти значения передаются в API самим Compose; отдельно добавлять их в список Portainer не нужно:

| Переменная | Значение в Docker |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATA_DIR` | `/app/data` — путь внутри постоянного тома `blizu_data` |

Для локальной разработки без Docker `PORT` и `DATA_DIR` можно задать вручную. Не меняйте порт API без соответствующего изменения Vite/Nginx proxy.

## Nginx Proxy Manager

Создайте Proxy Host с доменом из `APP_ORIGIN`: **Scheme** `http`, **Forward Hostname** `blizu-web`, **Forward Port** `8080`. Включите SSL и Force SSL; в Advanced добавьте `client_max_body_size 6m;`. Внешние порты API открывать не требуется.
