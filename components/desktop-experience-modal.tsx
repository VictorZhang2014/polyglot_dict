"use client";

import { useEffect, useState } from "react";
import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { useI18n } from "@/lib/use-i18n";

const DESKTOP_EXPERIENCE_MODAL_SEEN_KEY = "parlerai_desktop_experience_modal_seen_v1";

function isLikelyDesktopDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const hasFinePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const userAgentData = (navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean;
    };
  }).userAgentData;

  if (typeof userAgentData?.mobile === "boolean") {
    return !userAgentData.mobile && hasFinePointer;
  }

  const mobileUserAgentPattern = /android|iphone|ipad|ipod|mobile|windows phone|blackberry|opera mini/i;
  if (mobileUserAgentPattern.test(navigator.userAgent)) {
    return false;
  }

  return hasFinePointer && window.innerWidth >= 768;
}

export function DesktopExperienceModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    try {
      window.localStorage.setItem(DESKTOP_EXPERIENCE_MODAL_SEEN_KEY, "true");
    } catch {
      // Ignore storage failures and keep the prompt dismissed for this session.
    }

    setOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const hasSeenPrompt = window.localStorage.getItem(DESKTOP_EXPERIENCE_MODAL_SEEN_KEY) === "true";
      if (!hasSeenPrompt && isLikelyDesktopDevice()) {
        setOpen(true);
      }
    } catch {
      if (isLikelyDesktopDevice()) {
        setOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="desktop-experience-modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <Card
        className="desktop-experience-modal-card"
        size="4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-experience-modal-title"
        aria-describedby="desktop-experience-modal-description"
      >
        <Flex direction="column" gap="4">
          <div>
            <Text size="1" weight="bold" className="desktop-experience-modal-eyebrow">
              {t("desktopPrompt.eyebrow")}
            </Text>
          </div>
          <Heading id="desktop-experience-modal-title" size="5">
            {t("desktopPrompt.title")}
          </Heading>
          <Text id="desktop-experience-modal-description" size="3" className="desktop-experience-modal-copy">
            {t("desktopPrompt.description")}
          </Text>
          <Button type="button" size="3" variant="soft" color="green" onClick={handleClose}>
            {t("desktopPrompt.continue")}
          </Button>
        </Flex>
      </Card>
    </div>
  );
}
