export type WhatsAppContext = "home" | "schedule" | "session" | "membership";

export interface WhatsAppData {
  className?: string;
  date?: string;
  sessionTime?: string;
  packageName?: string;
}

const ADMIN_WA_NUMBER = process.env.EXPO_PUBLIC_ADMIN_WA_NUMBER?.replace(
  /\D/g,
  ""
);

export function buildWaLink(
  context: WhatsAppContext,
  data: WhatsAppData = {}
): string | null {
  if (!ADMIN_WA_NUMBER) {
    return null;
  }

  let message = "";

  switch (context) {
    case "home":
      message =
        "Halo Admin Revira Gym, saya ingin bertanya mengenai informasi gym.";
      break;

    case "schedule":
    case "session":
      message = `Halo Admin Revira Gym, saya ingin bertanya mengenai kelas ${
        data.className ?? ""
      }${data.date ? ` pada ${data.date}` : ""}${
        data.sessionTime ? ` pukul ${data.sessionTime}` : ""
      }.`;
      break;

    case "membership":
      message = `Halo Admin Revira Gym, saya ingin bertanya mengenai ${
        data.packageName ?? "paket membership"
      } dan ingin melakukan pendaftaran atau perpanjangan membership.`;
      break;
  }

  return `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(message)}`;
}