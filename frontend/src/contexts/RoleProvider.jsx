import { useState } from "react";
import { ROLES } from "@/lib/permissions";
import { RoleContext } from "@/contexts/roleContext";
import { DEFAULT_PROFILES, updateProfile } from "@/services/profileService";

export function RoleProvider({ children }) {
  const [role, setRole] = useState(ROLES.ADMIN);
  const [profiles, setProfiles] = useState(DEFAULT_PROFILES);
  const user = profiles[role];

  async function saveProfile(changes) {
    const updatedProfile = await updateProfile(role, changes);
    setProfiles((currentProfiles) => ({
      ...currentProfiles,
      [role]: updatedProfile,
    }));
    return updatedProfile;
  }

  return (
    <RoleContext.Provider value={{ role, setRole, user, saveProfile }}>
      {children}
    </RoleContext.Provider>
  );
}
