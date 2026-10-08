FROM serversideup/php:8.4-fpm-nginx-v4.5.1

ENV AUTORUN_ENABLED=true

WORKDIR /var/www/html

COPY --chown=www-data:www-data . /var/www/html

COPY --chmod=755 docker/entrypoint.d/ /etc/entrypoint.d/

RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist \
    && mkdir -p storage/app/private/receipts \
    && chmod -R ug+rwx storage bootstrap/cache

EXPOSE 8080
