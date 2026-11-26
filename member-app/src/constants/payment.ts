// Confirm these values with Orlando before enabling bank transfer.
// Tests inject an isolated dummy configuration; no dummy account ships to members.
export const PAYMENT_INSTRUCTIONS: {
  confirmed: boolean;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  instruction: string;
} = {
  confirmed: false,
  bankName: null,
  accountNumber: null,
  accountName: null,
  instruction: 'Informasi rekening belum tersedia. Hubungi admin atau pilih Bayar di Tempat.',
};
