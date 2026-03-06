import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ErrorPageComponent } from './error-page.component';

describe('ErrorPageComponent', () => {
  let component: ErrorPageComponent;
  let fixture: ComponentFixture<ErrorPageComponent>;

  // Симулираме първоначално 404 състояние
  const activatedRouteStub = {
    data: of({ type: '404' })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule,
        ErrorPageComponent // Standalone component
      ],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show 404 by default', () => {
    expect(component.errorCode).toBe(404);
    const compiled = fixture.nativeElement as HTMLElement;
    // Проверяваме дали големият надпис е 404
    expect(compiled.querySelector('.err-number')?.textContent).toContain('404');
  });

  it('should switch to 403 when route data type is 403', () => {
    // Ръчно подаваме 403 данни през mock-а
    (component as any).route.data = of({ type: 403 });
    
    component.ngOnInit(); // Реинициализираме логиката
    fixture.detectChanges(); // Обновяваме HTML-а

    expect(component.errorCode).toBe(403);
    
    const compiled = fixture.nativeElement as HTMLElement;
    // Търсим новия текст в заглавието
    expect(compiled.querySelector('.err-number')?.textContent).toContain('403');
    expect(compiled.querySelector('.err-message')?.textContent).toContain('Достъпът е ограничен');
  });

  it('should have the modern truck SVG and scanner line', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.modern-truck')).toBeTruthy();
    expect(compiled.querySelector('.scanner-line')).toBeTruthy();
  });
});