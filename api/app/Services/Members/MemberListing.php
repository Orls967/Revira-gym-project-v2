<?php

namespace App\Services\Members;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Daftar member untuk Admin Web (SCRUM-68) dengan status membership terkini (B11, SCRUM-104).
 *
 * Prioritas status: active > pending > expired > none.
 * - active: membership berlaku hari ini (scope activeOn, aturan B6 / SCRUM-71 yang sama dengan MembershipStatus).
 * - pending: pengajuan pending atau membership active yang belum mulai (scope awaiting).
 * - expired: status expired atau active dengan end_date lewat (scope lapsed).
 * - none: tidak punya membership, atau hanya punya pengajuan rejected.
 *
 * Filter status dan paket dijalankan di query database supaya paginasi benar; ketiga relasi kategori
 * di-eager load sehingga jumlah query tetap berapa pun jumlah member di halaman.
 */
class MemberListing
{
    public const PER_PAGE = 15;

    public const STATUSES = ['active', 'pending', 'expired', 'none'];

    /**
     * Status => [scope Membership, relasi one-of-many di User], urut sesuai prioritas.
     */
    private const CATEGORIES = [
        'active' => ['scope' => 'currentlyActive', 'relation' => 'currentActiveMembership'],
        'pending' => ['scope' => 'awaiting', 'relation' => 'awaitingMembership'],
        'expired' => ['scope' => 'lapsed', 'relation' => 'lapsedMembership'],
    ];

    /**
     * @param  array{status?: string|null, membership_plan_id?: int|string|null, search?: string|null}  $filters
     * @return LengthAwarePaginator<int, User>
     */
    public function paginate(array $filters): LengthAwarePaginator
    {
        $query = User::query()
            ->where('role', UserRole::Member)
            ->with($this->eagerLoads());

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $this->whereSearch($query, $search);
        }

        $status = $filters['status'] ?? null;
        $planId = $filters['membership_plan_id'] ?? null;

        if ($planId !== null && $planId !== '') {
            $this->wherePlan($query, (int) $planId, $status);
        } elseif ($status !== null && $status !== '') {
            $this->whereStatus($query, $status);
        }

        return $query->orderBy('name')
            ->orderBy('id')
            ->paginate(self::PER_PAGE)
            ->withQueryString();
    }

    /**
     * Status terkini member beserta membership penentunya (null untuk none).
     * User harus sudah memuat relasi kategori (lihat eagerLoads()) supaya tidak N+1.
     *
     * @return array{status: string, membership: Membership|null}
     */
    public static function currentFor(User $user): array
    {
        foreach (self::CATEGORIES as $status => $category) {
            $membership = $user->getRelationValue($category['relation']);

            if ($membership !== null) {
                return ['status' => $status, 'membership' => $membership];
            }
        }

        return ['status' => 'none', 'membership' => null];
    }

    /**
     * @return array<int, string>
     */
    private function eagerLoads(): array
    {
        return array_map(
            fn (array $category) => $category['relation'].'.membershipPlan',
            array_values(self::CATEGORIES),
        );
    }

    /**
     * Cari di nama, email, atau nomor HP. % dan _ dicari apa adanya, bukan sebagai wildcard LIKE;
     * karakter escape '!' dipakai karena backslash tidak berlaku sama di MySQL dan SQLite (pola GymClassController).
     *
     * @param  Builder<User>  $query
     */
    private function whereSearch(Builder $query, string $search): void
    {
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';

        $query->where(function (Builder $query) use ($pattern) {
            foreach (['name', 'email', 'phone_number'] as $column) {
                $query->orWhereRaw("{$column} LIKE ? ESCAPE '!'", [$pattern]);
            }
        });
    }

    /**
     * Member dengan status terkini tertentu: punya membership kategori itu dan tidak punya kategori yang lebih tinggi.
     * Status none = tidak punya membership di ketiga kategori.
     *
     * @param  Builder<User>  $query
     */
    private function whereStatus(Builder $query, string $status): void
    {
        foreach (self::CATEGORIES as $categoryStatus => $category) {
            $scope = $category['scope'];

            if ($categoryStatus === $status) {
                $query->whereHas('memberships', fn (Builder $query) => $query->{$scope}());

                return;
            }

            $query->whereDoesntHave('memberships', fn (Builder $query) => $query->{$scope}());
        }
    }

    /**
     * Member yang paket pada membership terkininya sama dengan $planId (paket yang ditampilkan di daftar).
     * Bila status juga difilter, hanya kategori status itu yang diperiksa.
     *
     * @param  Builder<User>  $query
     */
    private function wherePlan(Builder $query, int $planId, ?string $status): void
    {
        $statuses = ($status !== null && $status !== '') ? [$status] : array_keys(self::CATEGORIES);

        $query->where(function (Builder $query) use ($statuses, $planId) {
            // Status none tidak punya paket, jadi hasilnya kosong.
            $query->whereRaw('1 = 0');

            foreach ($statuses as $status) {
                if (! isset(self::CATEGORIES[$status])) {
                    continue;
                }

                $query->orWhere(function (Builder $query) use ($status, $planId) {
                    $this->whereStatus($query, $status);
                    $query->whereHas(
                        self::CATEGORIES[$status]['relation'],
                        fn (Builder $query) => $query->where('membership_plan_id', $planId),
                    );
                });
            }
        });
    }
}
