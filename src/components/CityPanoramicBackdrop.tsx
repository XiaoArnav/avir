import React from 'react';

interface CityPanoramicBackdropProps {
  cityId: string;
  country?: string;
  skylineColor?: string;
  isDark?: boolean;
  className?: string;
}

/**
 * Deterministic string hash function (djb2 algorithm)
 * Produces consistent, seed-based pseudo-random numbers for any city name on Earth.
 */
function hashCity(str: string): number {
  let hash = 5381;
  const s = str.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const CityPanoramicBackdrop: React.FC<CityPanoramicBackdropProps> = ({
  cityId,
  skylineColor,
  isDark = false,
  className = 'w-full h-full',
}) => {
  const normalizedId = (cityId || '').toLowerCase();
  const fill = skylineColor || (isDark ? '#F27A55' : '#C4512C');

  // Common floating atmospheric clouds (upper horizon)
  const clouds = (
    <g className="transition-opacity duration-700" style={{ color: fill }}>
      <path
        d="M60 48 C60 36 72 26 88 26 C94 26 100 28 104 32 C110 22 124 16 138 16 C158 16 174 30 176 48 C188 50 198 60 198 72 C198 84 186 94 172 94 L70 94 C54 94 42 82 42 68 C42 56 50 48 60 48 Z"
        fill="currentColor"
        opacity={isDark ? '0.14' : '0.18'}
      />
      <path
        d="M680 38 C680 28 690 20 704 20 C710 20 715 22 719 25 C725 18 736 14 748 14 C765 14 779 26 781 40 C791 42 800 50 800 60 C800 70 790 78 778 78 L690 78 C676 78 665 68 665 56 C665 46 672 38 680 38 Z"
        fill="currentColor"
        opacity={isDark ? '0.12' : '0.15'}
      />
      <path
        d="M980 52 C980 40 994 30 1012 30 C1019 30 1026 33 1031 38 C1038 27 1054 20 1070 20 C1094 20 1113 36 1115 56 C1129 58 1140 70 1140 84 C1140 98 1126 110 1110 110 L992 110 C973 110 958 96 958 80 C958 66 967 56 980 52 Z"
        fill="currentColor"
        opacity={isDark ? '0.16' : '0.2'}
      />
    </g>
  );

  // 1. Delhi NCR
  if (normalizedId.includes('delhi')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Delhi NCR architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.28' : '0.32'}>
          <path d="M520 240 L520 160 L540 160 L540 148 C540 120 660 120 660 148 L660 160 L680 160 L680 240 Z" fill="currentColor" />
          <path d="M860 240 L860 168 L880 168 L880 152 L910 152 L910 168 L960 168 L960 148 L990 148 L990 168 L1040 168 L1040 140 L1070 140 L1070 168 L1100 168 L1100 240 Z" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M110 92 C105 130 92 180 62 236 L158 236 C128 180 115 130 110 92 Z" fill="currentColor" />
          <polygon points="234,236 244,72 258,72 268,236" fill="currentColor" />
          <rect x="340" y="230" width="150" height="6" fill="currentColor" />
          <rect x="362" y="118" width="34" height="100" fill="currentColor" />
          <rect x="434" y="118" width="34" height="100" fill="currentColor" />
          <path d="M396 218 L396 156 C396 130 434 130 434 156 L434 218 Z" fill="currentColor" />
          <rect x="352" y="112" width="126" height="8" rx="1" fill="currentColor" />
          <rect x="540" y="180" width="240" height="56" fill="currentColor" />
          <path d="M632 126 C632 76 688 76 688 126 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 2. Patna
  if (normalizedId.includes('patna')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Patna Golghar and Ganga Setu architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="40" y="196" width="460" height="6" fill="currentColor" />
          <rect x="90" y="202" width="10" height="34" fill="currentColor" /><rect x="210" y="202" width="10" height="34" fill="currentColor" /><rect x="330" y="202" width="10" height="34" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M430 218 C430 84 690 84 690 218 Z" fill="currentColor" />
          <path d="M432 214 Q520 150 670 120" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.4" />
          <path d="M688 214 Q600 150 450 120" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.4" />
          <rect x="536" y="80" width="48" height="12" fill="currentColor" />
          <rect x="80" y="170" width="120" height="66" fill="currentColor" />
          <path d="M100 170 C100 120 180 120 180 170 Z" fill="currentColor" />
          <rect x="1000" y="210" width="180" height="8" rx="2" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 3. Varanasi
  if (normalizedId.includes('varanasi') || normalizedId.includes('banaras') || normalizedId.includes('kashi')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Varanasi Ganga Ghats and Kashi Vishwanath architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="20" y="228" width="300" height="8" fill="currentColor" /><rect x="40" y="220" width="260" height="8" fill="currentColor" /><rect x="60" y="212" width="220" height="8" fill="currentColor" />
          <path d="M80 180 C80 160 120 160 120 180 Z" fill="currentColor" /><line x1="100" y1="180" x2="100" y2="204" stroke="currentColor" strokeWidth="2.5" />
          <path d="M220 232 Q255 220 290 232 Z" fill="currentColor" />
          <path d="M480 180 C480 110 520 40 530 40 C540 40 580 110 580 180 Z" fill="currentColor" />
          <ellipse cx="530" cy="40" rx="14" ry="5" fill="currentColor" /><line x1="530" y1="36" x2="530" y2="14" stroke="currentColor" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  // 4. Kanpur
  if (normalizedId.includes('kanpur') || normalizedId.includes('cawnpore')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Kanpur JK Temple and Manchester of the East industrial skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="40,236 40,180 80,150 80,180 120,150 120,180 160,150 160,180 200,150 200,236" fill="currentColor" />
          <polygon points="230,236 238,48 252,48 260,236" fill="currentColor" />
          <path d="M465 180 C465 110 495 50 505 50 C515 50 545 110 545 180 Z" fill="currentColor" />
          <path d="M530 180 C530 90 565 24 580 24 C595 24 630 90 630 180 Z" fill="currentColor" />
          <path d="M615 180 C615 110 645 50 655 50 C665 50 695 110 695 180 Z" fill="currentColor" />
          <rect x="800" y="200" width="360" height="8" rx="2" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 5. Lahore
  if (normalizedId.includes('lahore')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Lahore Badshahi Mosque and Minar-e-Pakistan architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="135,200 144,48 156,48 165,200" fill="currentColor" />
          <polygon points="300,236 312,42 328,42 340,236" fill="currentColor" />
          <path d="M520 110 C500 36 620 36 600 110 Z" fill="currentColor" /><line x1="560" y1="36" x2="560" y2="14" stroke="currentColor" strokeWidth="3" />
          <path d="M400 160 C390 100 450 100 440 160 Z" fill="currentColor" /><path d="M680 160 C670 100 730 100 720 160 Z" fill="currentColor" />
          <polygon points="780,236 792,42 808,42 820,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 6. Beijing
  if (normalizedId.includes('beijing') || normalizedId.includes('peking')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Beijing Temple of Heaven and Forbidden City architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M70 132 Q200 96 330 132 L310 142 Q200 114 90 142 Z" fill="currentColor" />
          <path d="M430 206 Q570 172 710 206 L690 216 Q570 188 450 216 Z" fill="currentColor" />
          <path d="M460 174 Q570 140 680 174 L660 184 Q570 156 480 184 Z" fill="currentColor" />
          <path d="M490 142 Q570 96 650 142 Z" fill="currentColor" /><circle cx="570" cy="88" r="8" fill="currentColor" />
          <polygon points="820,236 840,54 890,54 870,236" fill="currentColor" />
          <polygon points="840,54 980,54 960,110 855,110" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 7. Tokyo
  if (normalizedId.includes('tokyo')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Tokyo Mount Fuji and Tokyo Tower architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.28' : '0.32'}>
          <polygon points="40,236 280,72 360,72 600,236" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="210,236 215,80 235,80 240,236" fill="currentColor" />
          <path d="M190 200 Q225 186 260 200 Z" fill="currentColor" /><path d="M200 140 Q225 126 250 140 Z" fill="currentColor" />
          <polygon points="410,236 490,90 530,90 610,236" fill="currentColor" />
          <line x1="510" y1="90" x2="510" y2="18" stroke="currentColor" strokeWidth="3" />
          <polygon points="840,236 874,38 886,38 920,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 8. London
  if (normalizedId.includes('london')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="London Big Ben and Tower Bridge architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="120" y="90" width="46" height="146" fill="currentColor" /><polygon points="116,58 143,14 170,58" fill="currentColor" />
          <circle cx="410" cy="130" r="80" stroke="currentColor" strokeWidth="3" fill="none" />
          <rect x="630" y="120" width="44" height="116" fill="currentColor" /><rect x="790" y="120" width="44" height="116" fill="currentColor" />
          <polygon points="980,236 1040,24 1100,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 9. Paris
  if (normalizedId.includes('paris')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Paris Eiffel Tower and Arc de Triomphe architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="80" y="110" width="140" height="126" fill="currentColor" /><path d="M120 236 L120 160 C120 130 180 130 180 160 L180 236 Z" fill="currentColor" opacity="0.3" />
          <polygon points="400,236 496,110 544,110 640,236" fill="currentColor" /><polygon points="506,110 517,20 523,20 534,110" fill="currentColor" />
          <rect x="800" y="130" width="160" height="106" fill="currentColor" /><circle cx="880" cy="135" r="16" fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  // 10. New York
  if (normalizedId.includes('new york') || normalizedId.includes('nyc') || normalizedId.includes('manhattan')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="New York Empire State Building and Statue of Liberty architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="92,170 100,105 120,105 128,170" fill="currentColor" /><line x1="120" y1="105" x2="135" y2="70" stroke="currentColor" strokeWidth="4" />
          <rect x="340" y="180" width="120" height="56" fill="currentColor" /><rect x="380" y="80" width="40" height="50" fill="currentColor" /><line x1="400" y1="44" x2="400" y2="10" stroke="currentColor" strokeWidth="3" />
          <path d="M635 110 C635 60 685 60 685 110 Z" fill="currentColor" />
          <rect x="990" y="110" width="70" height="126" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 11. Dubai / UAE
  if (normalizedId.includes('dubai') || normalizedId.includes('uae') || normalizedId.includes('emirates') || normalizedId.includes('abu dhabi')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Dubai Burj Khalifa and Burj Al Arab architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="90" y="80" width="14" height="156" fill="currentColor" /><rect x="180" y="80" width="14" height="156" fill="currentColor" /><rect x="80" y="70" width="124" height="14" fill="currentColor" />
          <polygon points="460,236 490,170 590,170 620,236" fill="currentColor" /><polygon points="530,50 538,10 542,10 550,50" fill="currentColor" />
          <path d="M800 236 L800 68 C800 68 880 78 880 170 C880 215 845 236 845 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 12. Sydney
  if (normalizedId.includes('sydney')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Sydney Opera House and Harbour Bridge architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M106 190 Q288 50 470 190" stroke="currentColor" strokeWidth="12" fill="none" /><rect x="50" y="186" width="480" height="10" fill="currentColor" />
          <path d="M640 218 Q720 190 760 90 Q790 170 820 218 Z" fill="currentColor" /><path d="M830 218 Q890 190 920 105 Q950 170 980 218 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 13. Cairo
  if (normalizedId.includes('cairo') || normalizedId.includes('giza') || normalizedId.includes('egypt')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Cairo Giza Pyramids and Citadel architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="60,236 280,52 500,236" fill="currentColor" /><polygon points="340,236 520,70 700,236" fill="currentColor" opacity="0.9" />
          <path d="M700 236 L700 185 Q750 160 810 185 L840 236 Z" fill="currentColor" /><circle cx="755" cy="140" r="14" fill="currentColor" />
          <path d="M960 180 C960 110 1060 110 1060 180 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 14. Bangkok
  if (normalizedId.includes('bangkok') || normalizedId.includes('thailand')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Bangkok Wat Arun and Grand Palace architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M480 196 C480 100 520 30 530 30 C540 30 580 100 580 196 Z" fill="currentColor" /><line x1="530" y1="30" x2="530" y2="10" stroke="currentColor" strokeWidth="2.5" />
          <polygon points="760,170 860,110 960,170" fill="currentColor" /><path d="M1000 236 C990 160 1030 160 1020 70 L1030 70 C1020 160 1060 160 1050 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 15. Singapore
  if (normalizedId.includes('singapore')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Singapore Marina Bay Sands and Supertree Grove architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* MARINA BAY SANDS 3 TOWERS & BOAT SKYDECK */}
          <rect x="180" y="90" width="34" height="146" fill="currentColor" />
          <rect x="250" y="90" width="34" height="146" fill="currentColor" />
          <rect x="320" y="90" width="34" height="146" fill="currentColor" />
          <path d="M150 90 Q270 70 410 90 L390 100 Q270 84 170 100 Z" fill="currentColor" />
          {/* SUPERTREE GROVE FUNNELS */}
          <polygon points="560,236 575,120 595,120 610,236" fill="currentColor" />
          <path d="M545 120 Q585 85 625 120 Z" fill="currentColor" />
          <polygon points="680,236 690,140 710,140 720,236" fill="currentColor" />
          <path d="M665 140 Q700 110 735 140 Z" fill="currentColor" />
          {/* SINGAPORE FLYER */}
          <circle cx="890" cy="130" r="70" stroke="currentColor" strokeWidth="3" fill="none" />
        </g>
      </svg>
    );
  }

  // 16. Berlin
  if (normalizedId.includes('berlin') || normalizedId.includes('germany')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Berlin Brandenburg Gate and Fernsehturm TV Tower architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* BRANDENBURG GATE */}
          <rect x="140" y="140" width="180" height="96" fill="currentColor" />
          <line x1="160" y1="140" x2="160" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="190" y1="140" x2="190" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="220" y1="140" x2="220" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="250" y1="140" x2="250" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="280" y1="140" x2="280" y2="236" stroke="currentColor" strokeWidth="5" />
          <rect x="130" y="128" width="200" height="12" fill="currentColor" />
          {/* Quadriga Chariot */}
          <polygon points="210,128 230,105 250,128" fill="currentColor" />
          {/* FERNSEHTURM (BERLIN TV TOWER) */}
          <polygon points="560,236 572,20 578,20 590,236" fill="currentColor" />
          <circle cx="575" cy="80" r="26" fill="currentColor" />
          <line x1="575" y1="20" x2="575" y2="2" stroke="currentColor" strokeWidth="2.5" />
          {/* REICHSTAG GLASS DOME */}
          <rect x="800" y="160" width="220" height="76" fill="currentColor" />
          <path d="M860 160 C860 110 960 110 960 160 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 17. Rome
  if (normalizedId.includes('rome') || normalizedId.includes('roma') || normalizedId.includes('italy')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Rome Colosseum and St Peter's Basilica architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* COLOSSEUM ARCHES */}
          <path d="M80 236 L80 110 C80 110 260 90 380 110 L380 236 Z" fill="currentColor" />
          <path d="M120 236 L120 180 C120 150 160 150 160 180 L160 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M180 236 L180 180 C180 150 220 150 220 180 L220 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M240 236 L240 180 C240 150 280 150 280 180 L280 236 Z" fill="currentColor" opacity="0.3" />
          {/* ST. PETER'S BASILICA DOME */}
          <rect x="560" y="160" width="240" height="76" fill="currentColor" />
          <path d="M630 160 C630 80 730 80 730 160 Z" fill="currentColor" />
          <line x1="680" y1="80" x2="680" y2="40" stroke="currentColor" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  // 18. San Francisco / California
  if (normalizedId.includes('san francisco') || normalizedId.includes('sf') || normalizedId.includes('california')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="San Francisco Golden Gate Bridge and Transamerica Pyramid architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* GOLDEN GATE BRIDGE */}
          <rect x="180" y="50" width="30" height="186" fill="currentColor" />
          <rect x="170" y="80" width="50" height="8" fill="currentColor" /><rect x="170" y="130" width="50" height="8" fill="currentColor" />
          <path d="M60 200 Q180 70 340 200" stroke="currentColor" strokeWidth="4" fill="none" />
          {/* TRANSAMERICA PYRAMID */}
          <polygon points="560,236 600,34 640,236" fill="currentColor" />
          <line x1="600" y1="34" x2="600" y2="10" stroke="currentColor" strokeWidth="2.5" />
          {/* SALESFORCE TOWER */}
          <path d="M740 236 L740 60 C740 30 800 30 800 60 L800 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 19. Rio de Janeiro / Brazil
  if (normalizedId.includes('rio') || normalizedId.includes('brazil') || normalizedId.includes('brasil')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Rio de Janeiro Christ the Redeemer and Sugarloaf Mountain architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* CORCOVADO MOUNTAIN & CHRIST THE REDEEMER */}
          <polygon points="200,236 340,90 480,236" fill="currentColor" />
          <rect x="330" y="50" width="20" height="40" fill="currentColor" />
          <line x1="290" y1="60" x2="390" y2="60" stroke="currentColor" strokeWidth="6" />
          {/* SUGARLOAF MOUNTAIN (PÃO DE AÇÚCAR) */}
          <path d="M680 236 C660 120 740 90 800 90 C860 90 940 120 920 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 20. Toronto / Canada
  if (normalizedId.includes('toronto') || normalizedId.includes('canada')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Toronto CN Tower and Rogers Centre architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* CN TOWER */}
          <polygon points="380,236 394,40 406,40 420,236" fill="currentColor" />
          <path d="M370 110 L430 110 L420 130 L380 130 Z" fill="currentColor" />
          <line x1="400" y1="40" x2="400" y2="10" stroke="currentColor" strokeWidth="2.5" />
          {/* ROGERS CENTRE (SKYDOME) */}
          <path d="M440 236 C440 140 580 140 580 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 21. Seoul / Korea
  if (normalizedId.includes('seoul') || normalizedId.includes('korea')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Seoul Namsan Tower and Gyeongbokgung architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* NAMSAN MOUNTAIN & N SEOUL TOWER */}
          <polygon points="180,236 320,130 460,236" fill="currentColor" />
          <polygon points="314,130 317,40 323,40 326,130" fill="currentColor" />
          <circle cx="320" cy="70" r="12" fill="currentColor" />
          {/* LOTTE WORLD TOWER (Tapering Needle) */}
          <polygon points="760,236 788,20 802,20 830,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 22. Istanbul / Turkey
  if (normalizedId.includes('istanbul') || normalizedId.includes('turkey') || normalizedId.includes('türkiye')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Istanbul Hagia Sophia and Galata Tower architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* HAGIA SOPHIA DOME & 4 MINARETS */}
          <rect x="360" y="160" width="280" height="76" fill="currentColor" />
          <path d="M440 160 C440 90 560 90 560 160 Z" fill="currentColor" />
          <polygon points="340,236 345,36 355,36 360,236" fill="currentColor" />
          <polygon points="640,236 645,36 655,36 660,236" fill="currentColor" />
          {/* GALATA TOWER */}
          <rect x="880" y="110" width="50" height="126" fill="currentColor" />
          <polygon points="870,110 905,60 940,110" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 23. Athens / Greece
  if (normalizedId.includes('athens') || normalizedId.includes('greece')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Athens Acropolis Parthenon architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* ACROPOLIS ROCKY PROMONTORY */}
          <polygon points="260,236 340,140 760,140 840,236" fill="currentColor" />
          {/* PARTHENON DORIC TEMPLE */}
          <rect x="380" y="90" width="280" height="14" fill="currentColor" />
          <polygon points="370,90 520,60 670,90" fill="currentColor" />
          <line x1="400" y1="104" x2="400" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="440" y1="104" x2="440" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="480" y1="104" x2="480" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="520" y1="104" x2="520" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="560" y1="104" x2="560" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="600" y1="104" x2="600" y2="140" stroke="currentColor" strokeWidth="5" />
          <line x1="640" y1="104" x2="640" y2="140" stroke="currentColor" strokeWidth="5" />
        </g>
      </svg>
    );
  }

  // 24. Moscow / Russia
  if (normalizedId.includes('moscow') || normalizedId.includes('russia')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Moscow Saint Basil Cathedral and Kremlin architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* SAINT BASIL'S ONION DOMES */}
          <rect x="280" y="160" width="280" height="76" fill="currentColor" />
          <path d="M330 160 C310 100 370 100 350 160 Z" fill="currentColor" />
          <path d="M420 160 C390 60 470 60 440 160 Z" fill="currentColor" />
          <path d="M510 160 C490 100 550 100 530 160 Z" fill="currentColor" />
          {/* KREMLIN SPASSKAYA TOWER */}
          <rect x="760" y="120" width="70" height="116" fill="currentColor" />
          <polygon points="750,120 795,44 840,120" fill="currentColor" />
          <line x1="795" y1="44" x2="795" y2="18" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 25. Indian Metros: Mumbai, Bengaluru, Kolkata, Lucknow, Hyderabad, Ahmedabad, Pune
  if (normalizedId.includes('mumbai') || normalizedId.includes('bombay')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Mumbai Gateway of India and Bandra-Worli Sea Link architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="170,236 182,54 192,54 204,236" fill="currentColor" />
          <rect x="370" y="230" width="190" height="6" fill="currentColor" /><rect x="414" y="116" width="112" height="108" fill="currentColor" />
          <path d="M442 224 L442 160 C442 126 498 126 498 160 L498 224 Z" fill="currentColor" />
          <path d="M700 138 C694 100 730 68 730 68 C730 68 766 100 760 138 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('bengaluru') || normalizedId.includes('bangalore')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Bengaluru Vidhana Soudha architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="380" y="152" width="380" height="66" fill="currentColor" /><path d="M530 96 C530 46 610 46 610 96 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('kolkata') || normalizedId.includes('calcutta')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Kolkata Howrah Bridge architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <polygon points="190,236 215,64 235,64 260,236" fill="currentColor" /><line x1="225" y1="74" x2="50" y2="216" stroke="currentColor" strokeWidth="3.5" />
          <rect x="510" y="162" width="320" height="62" fill="currentColor" /><path d="M634 104 C634 48 706 48 706 104 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('lucknow')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Lucknow Rumi Darwaza architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M430 236 L430 156 C430 68 530 46 530 46 C530 46 630 68 630 156 L630 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('hyderabad')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Hyderabad Charminar architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="420" y="126" width="240" height="110" fill="currentColor" /><polygon points="380,236 394,48 408,48 420,236" fill="currentColor" /><polygon points="660,236 672,48 686,48 700,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('ahmedabad')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Ahmedabad Sidi Saiyyed architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <rect x="410" y="120" width="280" height="116" fill="currentColor" /><path d="M70 236 Q210 120 350 236 Z" fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  if (normalizedId.includes('pune')) {
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label="Pune Shaniwar Wada architectural skyline silhouette">
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          <path d="M410 236 L410 110 C410 88 470 88 470 110 L470 236 Z" fill="currentColor" /><path d="M610 236 L610 110 C610 88 670 88 670 110 L670 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // =========================================================================
  // 26. SMART PROCEDURAL ARCHITECTURAL GENERATOR FOR ALL OTHER WORLD CITIES
  // Every city on Earth generates its own unique, seed-based distinct silhouette!
  // =========================================================================
  const seed = hashCity(cityId);
  const archetype = seed % 4; // 0: Alpine/Mountain, 1: Coastal/Maritime, 2: Classical/Heritage, 3: Futuristic Metropolis

  // Derived unique heights & positions based on seed
  const h1 = 50 + (seed % 60);
  const h2 = 80 + ((seed >> 2) % 80);
  const h3 = 40 + ((seed >> 4) % 90);
  const h4 = 70 + ((seed >> 6) % 70);
  const bridgeSpan = 140 + (seed % 100);

  if (archetype === 0) {
    // Alpine / Mountain Ridge & Clock Tower (e.g. Zurich, Reykjavik, Kathmandu, Innsbruck)
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label={`${cityId} Alpine Mountain Skyline`}>
        {clouds}
        {/* Background Mountain Peaks */}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <polygon points="20,236 180,60 340,236" fill="currentColor" />
          <polygon points="280,236 460,40 640,236" fill="currentColor" />
          <polygon points="580,236 780,50 980,236" fill="currentColor" />
          <polygon points="900,236 1060,80 1200,236" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* Alpine Chalet & Spire */}
          <polygon points={`100,236 100,${180 - h1 / 2} 150,${120 - h1 / 2} 200,${180 - h1 / 2} 200,236`} fill="currentColor" />
          {/* Tall Clock Spire */}
          <rect x="360" y={h2} width="40" height={236 - h2} fill="currentColor" />
          <polygon points={`355,${h2} 380,${h2 - 40} 405,${h2}`} fill="currentColor" />
          {/* Cable Car / Bridge Span */}
          <line x1="450" y1={120} x2={450 + bridgeSpan} y2={120} stroke="currentColor" strokeWidth="3" />
          <rect x="740" y={h4} width="90" height={236 - h4} fill="currentColor" />
          <polygon points={`850,236 920,${h3} 990,236`} fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (archetype === 1) {
    // Coastal / Island / Harbor Viaduct (e.g. Honolulu, Miami, Cape Town, Auckland, Perth)
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label={`${cityId} Coastal Maritime Skyline`}>
        {clouds}
        {/* Coastal Ocean Horizon Waves */}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <path d="M0 210 Q300 190 600 210 Q900 190 1200 210 L1200 240 L0 240 Z" fill="currentColor" />
          <circle cx="1040" cy="80" r="14" fill="currentColor" opacity="0.4" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* Seaside Lighthouse */}
          <polygon points="120,236 135,70 155,70 170,236" fill="currentColor" />
          <rect x="130" y="58" width="30" height="12" fill="currentColor" />
          {/* Coastal Suspension Bridge Pylon */}
          <rect x="420" y={h1} width="24" height={236 - h1} fill="currentColor" />
          <path d={`M280 200 Q432 ${h1 - 20} 580 200`} stroke="currentColor" strokeWidth="4" fill="none" />
          {/* Marina Waterfront Towers */}
          <rect x="680" y={h2} width="80" height={236 - h2} fill="currentColor" />
          <path d={`M780 236 L780 ${h4} Q830 ${h4 - 30} 880 ${h4} L880 236 Z`} fill="currentColor" />
          <rect x="940" y={h3} width="60" height={236 - h3} fill="currentColor" />
        </g>
      </svg>
    );
  }

  if (archetype === 2) {
    // Classical / Old World Heritage Domes & Arches (e.g. Vienna, Prague, Budapest, Seville)
    return (
      <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label={`${cityId} Classical Heritage Skyline`}>
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* Roman / Classical Colonnade */}
          <rect x="100" y="160" width="180" height="76" fill="currentColor" />
          <line x1="120" y1="160" x2="120" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="160" y1="160" x2="160" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="200" y1="160" x2="200" y2="236" stroke="currentColor" strokeWidth="5" />
          <line x1="240" y1="160" x2="240" y2="236" stroke="currentColor" strokeWidth="5" />
          {/* Monumental Cathedral Dome */}
          <rect x="440" y="150" width="220" height="86" fill="currentColor" />
          <path d="M490 150 C490 80 610 80 610 150 Z" fill="currentColor" />
          <line x1="550" y1="80" x2="550" y2="46" stroke="currentColor" strokeWidth="3" />
          {/* Gothic Campanile / Bell Tower */}
          <rect x="760" y={h2} width="48" height={236 - h2} fill="currentColor" />
          <polygon points={`754,${h2} 784,${h2 - 45} 814,${h2}`} fill="currentColor" />
          {/* Archway Bridge */}
          <rect x="880" y={h4} width="160" height={236 - h4} fill="currentColor" />
          <path d={`M920 236 L920 180 C920 150 1000 150 1000 180 L1000 236 Z`} fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  // Archetype 3: Modern High-Tech Metropolis (e.g. Chicago, Kuala Lumpur, Santiago, Frankfurt)
  return (
    <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMax slice" className={`${className} transition-all duration-700 pointer-events-none select-none`} xmlns="http://www.w3.org/2000/svg" aria-label={`${cityId} Modern Metropolis Skyline`}>
      {clouds}
      <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
        <rect x="80" y="120" width="70" height="120" fill="currentColor" />
        <rect x="220" y="90" width="90" height="150" fill="currentColor" />
        <rect x="960" y="100" width="80" height="140" fill="currentColor" />
      </g>
      <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
        <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
        {/* Procedural High-Rise 1 with Sloped Roof */}
        <polygon points={`120,236 120,${h1} 180,${h1 - 25} 180,236`} fill="currentColor" />
        {/* Procedural Tower 2 with Antenna Spire */}
        <rect x="280" y={h2} width="70" height={236 - h2} fill="currentColor" />
        <line x1="315" y1={h2} x2="315" y2={h2 - 35} stroke="currentColor" strokeWidth="3" />
        {/* Central Crown Skyscraper */}
        <rect x="480" y={h4} width="110" height={236 - h4} fill="currentColor" />
        <polygon points={`480,${h4} 535,${h4 - 40} 590,${h4}`} fill="currentColor" />
        {/* Connected Skybridge Tower */}
        <rect x="680" y={h3} width="65" height={236 - h3} fill="currentColor" />
        <rect x="770" y={h3 + 20} width="65" height={236 - (h3 + 20)} fill="currentColor" />
        <rect x="745" y={h3 + 40} width="30" height="12" fill="currentColor" />
        {/* Stepped High-Rise */}
        <rect x="920" y="140" width="120" height="96" fill="currentColor" />
        <rect x="940" y="90" width="80" height="50" fill="currentColor" />
        <rect x="960" y="50" width="40" height="40" fill="currentColor" />
      </g>
    </svg>
  );
};
