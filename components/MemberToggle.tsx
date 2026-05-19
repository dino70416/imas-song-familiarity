'use client';

import React, { useState } from 'react';

interface Member {
  name: string;
  cvName: string | null;
}

export default function MemberToggle({ members }: { members: Member[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!members || members.length === 0) return null;

  return (
    <div
      className={`song-members ${expanded ? 'expanded' : ''}`}
      onClick={(e) => {
        e.stopPropagation(); // Prevent card clicks if container has them
        setExpanded(!expanded);
      }}
      style={{ cursor: 'pointer' }}
      title="點擊展開/收合全部演唱成員"
    >
      演唱成員: {members.map((m) => `${m.name}${m.cvName ? ` (${m.cvName})` : ''}`).join(', ')}
    </div>
  );
}
