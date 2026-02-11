import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface UserProfile {
  id: number;
  userName: string;
  email: string;
  phoneNumber: string;
  role: string;
  reputation: number;
  reportCount: number;
  createdAt: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  userProfile: UserProfile | null = null;
  isLoading = true;
  errorMessage = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadUserProfile();
  }

  loadUserProfile() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (!token || !user) {
      this.router.navigate(['/login']);
      return;
    }

    const userData = JSON.parse(user);
    const userId = userData.id;

    this.http.get<UserProfile>(`https://localhost:7277/api/Users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (profile) => {
        this.userProfile = profile;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading profile:', err);
        this.errorMessage = 'Грешка при зареждане на профила';
        this.isLoading = false;
      }
    });
  }

  getRoleLabel(role: string): string {
    const roleLabels: { [key: string]: string } = {
      'Admin': 'Администратор',
      'Driver': 'Шофьор',
      'User': 'Потребител'
    };
    return roleLabels[role] || 'Потребител';
  }

  getRoleBadgeClass(role: string): string {
    const roleClasses: { [key: string]: string } = {
      'Admin': 'badge-admin',
      'Driver': 'badge-driver',
      'User': 'badge-user'
    };
    return roleClasses[role] || 'badge-user';
  }

  getReputationLevel(reputation: number): string {
    if (reputation >= 90) return 'Отличен';
    if (reputation >= 70) return 'Много добър';
    if (reputation >= 50) return 'Добър';
    if (reputation >= 30) return 'Среден';
    return 'Начинаещ';
  }

  getReputationClass(reputation: number): string {
    if (reputation >= 90) return 'rep-excellent';
    if (reputation >= 70) return 'rep-very-good';
    if (reputation >= 50) return 'rep-good';
    if (reputation >= 30) return 'rep-average';
    return 'rep-beginner';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return `${diffDays} дни`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'месец' : 'месеца'}`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} ${years === 1 ? 'година' : 'години'}`;
    }
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  navigateBack() {
    this.router.navigate(['/']);
  }

  editProfile() {
    // Placeholder за бъдеща функционалност
    console.log('Edit profile clicked');
  }
}