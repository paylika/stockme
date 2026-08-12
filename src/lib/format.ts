export function formatFCFA(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

export function whatsappLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
