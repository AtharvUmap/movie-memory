import Image from "next/image";
import { getInitials } from "@/lib/display";

type Props = { name: string; image: string | null; size?: number };

// The name is shown right next to the avatar, so alt="" (decorative)
// avoids screen readers announcing it twice.
export function UserAvatar({ name, image, size = 80 }: Props) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-zinc-200 text-2xl font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
    >
      {getInitials(name)}
    </div>
  );
}
