# Angular Development Rules - One Piece TCG Scanner

## Master Rule
- All code must be in English
- Always set the project rules active
- Comments must be clear, concise, and explain the "why" behind implementations in Spanish
- Maintain consistent communication standards across the team

## 1. Code Structure & Style
### Naming Conventions
- Use descriptive, self-explanatory names in English
- Variables & Functions: camelCase (e.g., `userProfile`, `getUserData()`)
- Components & Services: kebab-case (e.g., `card-scanner.component.ts`)
- Interfaces & Classes: PascalCase (e.g., `CardData`, `OcrService`)

### Code Formatting
- Indentation: 2 spaces (Angular standard)
- Maximum line length: 120 characters
- Use explicit parentheses in complex operations
- Break long lines at logical points (operators, parameters)

### File Organization
- One component/service/class per file
- Follow feature-based folder structure
- Maintain clear separation of concerns

## 2. Angular Best Practices - One Piece TCG Scanner
### Component Architecture
- Use standalone components by default
- Implement smart/dumb component pattern
- Keep components focused and single-responsibility
- Leverage Angular Signals for state management

### Camera & OCR Components
- CardScannerComponent: Handles camera access
- CardDisplayComponent: Shows card information
- GalleryComponent: Manages card collection
- ExportComponent: Handles data export

### Performance Optimization
- Implement OnPush change detection strategy
- Use trackBy with *ngFor directives
- Lazy load non-critical modules
- Implement virtual scrolling for card galleries
- Use pure pipes for card data computations

### Data Management
- Implement proper state management with Signals
- Use TypeScript strict mode
- Define strong typing for card data interfaces
- Implement proper error boundaries for OCR failures

## 3. Security & Error Handling
### Security Measures
- Implement Content Security Policy (CSP)
- Use Angular's built-in XSS protection
- Sanitize all user inputs from OCR
- Store sensitive data in environment variables
- Implement proper CORS policies for API calls

### Error Management
- Implement global error handling for OCR failures
- Use structured error logging
- Implement retry mechanisms for OCR calls
- Provide meaningful error messages to users in Spanish

## 4. One Piece TCG Specific Rules
### Card Data Structure
```typescript
interface CardData {
  id: string;           // OP01-001
  name: string;         // Monkey D. Luffy
  rarity: string;       // Common, Rare, Super Rare, etc.
  price: number;        // Current market price
  set: string;          // OP01, OP02, etc.
  type: string;         // Character, Event, Stage
  color: string[];      // Red, Blue, Green, etc.
  cost: number;         // Play cost
  power: number;        // Character power
  attribute: string;    // Slash, Strike, etc.
  imageUrl: string;     // Card image URL
}
```

### OCR Service Requirements
- Extract card codes (pattern: OP\d{2}-\d{3})
- Handle multiple image formats
- Implement confidence scoring
- Retry mechanism for failed scans

### Gallery Management
- Use IndexedDB for local storage
- Implement card count tracking
- Support bulk operations
- Export to JSON format

## 5. UI/UX Guidelines - One Piece Theme
### Design System
- Primary colors: Navy blue (#1B365D), Gold (#FFD700), Red (#DC143C)
- Typography: Bold headers, manga-style fonts
- Layout: Card-based design with rounded corners
- Icons: Pirate/marine themed icons

### Responsive Design
- Mobile-first approach
- Touch-friendly buttons (minimum 44px)
- Optimized camera interface for mobile
- Swipe gestures for gallery navigation

### Accessibility
- WCAG 2.1 compliance
- Screen reader support for card information
- High contrast mode support
- Keyboard navigation for all features

## 6. FastAPI Backend Rules
### API Design
- Use async/await for all endpoints
- Implement proper HTTP status codes
- Use Pydantic models for validation
- Follow RESTful conventions

### OCR Service
- Process images in chunks for large files
- Implement timeout handling
- Return confidence scores
- Support multiple image formats

### Error Handling
- Return structured error responses
- Log all OCR failures
- Implement rate limiting
- Validate file uploads

## 7. Development Workflow
### File Naming
- Components: `card-scanner.component.ts`
- Services: `ocr.service.ts`
- Interfaces: `card-data.interface.ts`
- Utils: `image-processing.util.ts`

### Testing Strategy
- Unit tests for all services
- Component testing for UI interactions
- E2E tests for OCR workflow
- Mock OCR responses for testing

### Documentation
- JSDoc for all public methods
- Inline comments in Spanish for complex logic
- API documentation with examples
- User guide for card scanning

## 8. Performance & Optimization
### Image Processing
- Resize images before OCR processing
- Implement client-side compression
- Cache processed results
- Progressive image loading in gallery

### Bundle Optimization
- Lazy load camera functionality
- Tree-shake unused libraries
- Optimize OCR library imports
- Implement service workers for offline support

## 9. Data Management
### Local Storage Strategy
- IndexedDB for card collection
- localStorage for user preferences
- Session storage for temporary data
- Implement data migration strategies

### Export/Import Features
- JSON export with metadata
- Support for deck lists
- Backup/restore functionality
- Share collection via JSON files 