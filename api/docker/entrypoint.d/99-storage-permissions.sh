#!/bin/sh

# Pastikan subfolder receipts pada private storage selalu ada
mkdir -p /var/www/html/storage/app/private/receipts

# Sesuaikan izin tulis untuk user www-data jika Railway Volume di-mount sebagai root
if [ -d "/var/www/html/storage/app/private" ]; then
    chown -R www-data:www-data /var/www/html/storage/app/private 2>/dev/null || echo "Warning: Unable to chown /var/www/html/storage/app/private (container may not be running as root). Continuing..."
    chmod -R ug+rwx /var/www/html/storage/app/private 2>/dev/null || echo "Warning: Unable to chmod /var/www/html/storage/app/private. Continuing..."
fi

exit 0
