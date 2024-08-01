"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { Loader2Icon, StarIcon } from "lucide-react";
import useSubsription from "@/hooks/useSubscription";
import { useTransition } from "react";
import { createStripePortal } from "@/actions/createStripePortal";
import { useRouter } from "next/navigation";

const UpgradeButton = () => {
  const { hasActiveMembership, loading } = useSubsription();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAccount = () => {
    startTransition(async () => {
      const stripePortalUrl = await createStripePortal();
      router.push(stripePortalUrl);
    });
  };

  if (!hasActiveMembership && !loading) {
    return (
      <Button asChild variant="default" className="border-indigo-600">
        <Link href="/dashboard/upgrade">
          Upgrade <StarIcon className="ml-3 fill-indigo-600 text-white" />
        </Link>
      </Button>
    );
  }

  if (loading) {
    return (
      <Button variant="default" className="border-indigo-600">
        <Loader2Icon className="animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      onClick={handleAccount}
      disabled={isPending}
      variant="default"
      className="border-indigo-600 bg-indigo-600"
    >
      {isPending ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <p>
          <span className="font-extrabold">PRO Account</span>
        </p>
      )}
    </Button>
  );
};
export default UpgradeButton;
